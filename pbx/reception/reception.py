#!/usr/bin/python3
"""Durable PBX reception. No listening socket, external Python dependencies or AI."""
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(os.environ.get('PBX_STATE_DIR', '/var/lib/devree-reception'))
SOUNDS = Path(os.environ.get('PBX_SOUND_DIR', '/var/lib/asterisk/sounds/custom/devree-reception'))
PROMPTS = ['main', 'number', 'confirm-number', 'callback-consent', 'viewing-consent',
           'callback-saved', 'unknown-saved', 'record', 'viewing-info', 'viewing-saved',
           'fallback', 'goodbye', 'storage-error']

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def phone(value):
    if not isinstance(value, str) or not re.fullmatch(r'[+\d\s().-]+', value):
        return None
    value = re.sub(r'[^\d+]', '', value)
    if value.startswith('00'):
        value = '+' + value[2:]
    elif re.fullmatch(r'0[1-9]\d{8}', value):
        value = '+31' + value[1:]
    elif re.fullmatch(r'31[1-9]\d{8}', value):
        value = '+' + value
    if not re.fullmatch(r'\+[1-9]\d{7,14}', value):
        return None
    if value.startswith('+31') and not re.fullmatch(r'\+31[1-9]\d{8}', value):
        return None
    return value

def db():
    ROOT.mkdir(mode=0o750, parents=True, exist_ok=True)
    (ROOT / 'recordings').mkdir(mode=0o750, exist_ok=True)
    c = sqlite3.connect(ROOT / 'queue.sqlite3', timeout=10)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA synchronous=FULL')
    c.execute('CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, payload TEXT NOT NULL, request_id TEXT, finalized INTEGER DEFAULT 0, uploaded INTEGER DEFAULT 0, updated REAL NOT NULL, acknowledged INTEGER DEFAULT 0)')
    c.commit()
    return c

def save_call(c, call_id, kind, number, received, consent=None, finalized=False):
    old = c.execute('SELECT payload FROM calls WHERE id=?', (call_id,)).fetchone()
    revision = json.loads(old['payload'])['revision'] + 1 if old else 1
    payload = dict(eventId=f'{call_id}:{revision}', callId=call_id, revision=revision,
                   kind=kind, phone=number, receivedAt=received, consentAt=consent)
    with c:
        c.execute('INSERT INTO calls (id,payload,finalized,updated) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, finalized=excluded.finalized,updated=excluded.updated,acknowledged=0',
                  (call_id, json.dumps(payload), int(finalized), time.time()))
    return payload

def config():
    try:
        return json.loads((ROOT / 'config.json').read_text())
    except (OSError, ValueError):
        return dict(version=0, mode='available', awayUntil=None, closedDates=[])

def mode(cfg, moment=None):
    moment = moment or dt.datetime.now(dt.timezone.utc)
    local = moment.astimezone(ZoneInfo('Europe/Amsterdam'))
    minute = local.hour * 60 + local.minute
    span = None if local.weekday() == 6 else (600, 780) if local.weekday() == 5 else (540, 1050)
    if not span or local.date().isoformat() in cfg.get('closedDates', []) or not span[0] <= minute < span[1]:
        return 'closed'
    try:
        away = dt.datetime.fromisoformat(cfg.get('awayUntil') or '').timestamp() > moment.timestamp()
    except ValueError:
        away = False
    return 'away' if cfg.get('mode') == 'away' and away else 'available'

class HungUp(Exception):
    pass

class AGI:
    def __init__(self):
        self.env = {}
        for line in sys.stdin:
            if not line.strip():
                break
            key, _, value = line.partition(':')
            self.env[key] = value.strip()

    def command(self, command):
        print(command, flush=True)
        line = sys.stdin.readline().strip()
        if not line or 'result=-1' in line or line.startswith('HANGUP'):
            raise HungUp()
        match = re.search(r'result=(-?\d+)(?: \((.*)\))?', line)
        return (int(match[1]), match[2] or '') if match else (0, '')

    def play(self, name):
        return self.command(f'EXEC Playback {SOUNDS / name}')

    def read(self, name, digits=1):
        self.command(f'EXEC Read choice,{SOUNDS / name},{digits},,1,7')
        return self.command('GET VARIABLE choice')[1]

    def number(self, current):
        if current:
            return current
        for _ in range(2):
            candidate = phone(self.read('number', 15))
            if candidate:
                self.command('SAY DIGITS ' + candidate.replace('+', '00') + ' ""')
                if self.read('confirm-number') == '1':
                    return candidate
        return None

    def record(self, call_id):
        self.play('record')
        self.command(f'EXEC Record {ROOT / "recordings" / call_id}.wav,5,120,k')

def has_recording(call_id):
    p = ROOT / 'recordings' / (call_id + '.wav')
    return p.exists() and p.stat().st_size > 1644

def run_agi():
    # Asterisk sends SIGHUP on caller hangup; keep the final disk write alive.
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    agi = AGI()
    unique = agi.env.get('agi_uniqueid', '')
    if not unique:
        return
    call_id = hashlib.sha256(unique.encode()).hexdigest()[:40]
    number = phone(agi.env.get('agi_callerid', ''))
    received, consent, kind = now(), None, 'missed'
    c = None
    try:
        c = db()
        if shutil.disk_usage(ROOT).free < 100 * 1024 * 1024:
            raise OSError('Insufficient storage')
        if agi.env.get('agi_arg_1') != 'menu' and mode(config()) == 'available':
            agi.command('EXEC Dial PJSIP/475900001@475900006&PJSIP/475900003@475900006&PJSIP/475900005@475900006,20')
            if agi.command('GET VARIABLE DIALSTATUS')[1] == 'ANSWER':
                return
        agi.command('ANSWER')
        menu_started = True
        choice = agi.read('main')
        if choice not in ('1', '2'):
            choice = agi.read('main')
        if choice == '1':
            number = agi.number(number)
            # Register a callback even if the caller hangs up during consent.
            kind = 'callback'
            save_call(c, call_id, kind, number, received)
            if number and agi.read('callback-consent') == '1':
                consent = now()
                save_call(c, call_id, kind, number, received, consent)
            agi.play('callback-saved' if number else 'unknown-saved')
            agi.record(call_id)
        elif choice == '2':
            kind = 'viewing'
            agi.play('viewing-info')
            number = agi.number(number)
            if number and agi.read('viewing-consent') == '1':
                consent = now()
                save_call(c, call_id, kind, number, received, consent)
                agi.play('viewing-saved')
        else:
            agi.play('fallback')
            agi.record(call_id)
        agi.play('goodbye')
    except HungUp:
        pass
    except Exception as e:
        print('PBX reception: ' + type(e).__name__, file=sys.stderr)
        try:
            agi.play('storage-error')
        except HungUp:
            pass
    finally:
        if c:
            if kind == 'missed' and has_recording(call_id):
                kind = 'callback'
            # A successful human conversation is not a missed call.
            if kind != 'missed' or 'menu_started' in locals():
                try:
                    save_call(c, call_id, kind, number, received, consent, True)
                except Exception as e:
                    print('PBX final persistence failed: ' + type(e).__name__, file=sys.stderr)
            c.close()

def api(path, data=None, content_type='application/json', extra=None):
    base = os.environ['PBX_PLATFORM_URL'].rstrip('/')
    if not base.startswith('https://'):
        raise ValueError('HTTPS required')
    payload = json.dumps(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request(base + '/api/pbx/' + path, data=payload,
        headers={'Authorization': 'Bearer ' + os.environ['PBX_SERVICE_SECRET'], 'Content-Type': content_type, **(extra or {})})
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.load(r)

def atomic_config(cfg):
    tmp = ROOT / 'config.tmp'
    with tmp.open('w') as f:
        json.dump(cfg, f)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(ROOT / 'config.json')

def sync_once(c):
    errors = 0
    try:
        atomic_config(api('config')['config'])
    except Exception:
        errors += 1
    # Recover finalized recordings after a process/server crash, never during a call.
    with c:
        c.execute('UPDATE calls SET finalized=1 WHERE finalized=0 AND updated < ?', (time.time() - 600,))
    for row in c.execute('SELECT * FROM calls WHERE acknowledged=0 OR (finalized=1 AND uploaded=0) ORDER BY updated LIMIT 20').fetchall():
        try:
            request_id = row['request_id']
            if not row['acknowledged']:
                response = api('events', json.loads(row['payload']))
                if not response.get('stored') or not response.get('requestId'):
                    raise ValueError('Missing durable acknowledgement')
                request_id = response['requestId']
                with c:
                    c.execute('UPDATE calls SET request_id=?,acknowledged=1 WHERE id=? AND payload=?', (request_id, row['id'], row['payload']))
            if row['finalized'] and request_id and not row['uploaded']:
                p = ROOT / 'recordings' / (row['id'] + '.wav')
                if has_recording(row['id']):
                    data = p.read_bytes()
                    response = api(f'requests/{request_id}/recording', data, 'audio/wav', {'X-Content-SHA256': hashlib.sha256(data).hexdigest()})
                    if not (response.get('stored') or response.get('expired')):
                        raise ValueError('Recording not acknowledged')
                    if response.get('expired'):
                        p.unlink(missing_ok=True)
                else:
                    p.unlink(missing_ok=True)
                with c:
                    c.execute('UPDATE calls SET uploaded=1 WHERE id=? AND finalized=1', (row['id'],))
        except Exception:
            errors += 1
    stats = c.execute('SELECT COUNT(*) AS pending, MIN(updated) AS oldest FROM calls WHERE acknowledged=0 OR (finalized=1 AND uploaded=0)').fetchone()
    try:
        asterisk = subprocess.run(['/usr/sbin/asterisk', '-rx', 'core waitfullybooted'], capture_output=True, timeout=3).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        asterisk = False
    try:
        result = api('heartbeat', dict(appliedVersion=config().get('version', 0), pending=stats['pending'],
            oldestPendingAt=dt.datetime.fromtimestamp(stats['oldest'], dt.timezone.utc).isoformat() if stats['oldest'] else None,
            audioReady=all((SOUNDS / (s + '.wav')).is_file() for s in PROMPTS),
            storageReady=shutil.disk_usage(ROOT).free > 100 * 1024 * 1024, asteriskReady=asterisk,
            testRouteOnly=os.environ.get('PBX_ROUTE_MODE', 'test') != 'live'))
        for call_id in result.get('deleteRecordings', []):
            if re.fullmatch(r'[a-f0-9]{40}', call_id):
                (ROOT / 'recordings' / (call_id + '.wav')).unlink(missing_ok=True)
    except Exception:
        errors += 1
    return errors

def worker():
    c = db()
    while True:
        try:
            errors = sync_once(c)
            if errors:
                print(f'Reception sync: {errors} operations pending retry', flush=True)
        except Exception as e:
            print('Reception worker: ' + type(e).__name__, flush=True)
        time.sleep(10)

if __name__ == '__main__':
    os.umask(0o027)
    worker() if len(sys.argv) > 1 and sys.argv[1] == 'worker' else run_agi()
