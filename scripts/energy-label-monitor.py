#!/usr/bin/env python3
"""EP-Online -> regional signals. Standard library only; credentials stay on host.
Run as the platform user. SQLite holds current labels, checkpoints and an outbox.
The platform remains the UI and durable observation/outcome store.
"""
import argparse
import csv
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from zoneinfo import ZoneInfo

API = 'https://public.ep-online.nl/api/v5'
PDOK = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free'
UTC = dt.timezone.utc


def stamp():
    return dt.datetime.now(UTC).isoformat()


def date_value(value):
    if not value:
        return None
    value = str(value).strip()
    for fmt in ('%Y%m%d', '%Y-%m-%d', '%d-%m-%Y'):
        try:
            return dt.datetime.strptime(value[:10] if '-' in value else value[:8], fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError('Invalid source date')


def candidate(postcode):
    # Superset only. Exact BAG municipality/place validation follows for signals.
    return bool(re.fullmatch(r'(3181|319[1-5]|32[0-3][0-9])[A-Z]{2}', postcode))


def in_area(doc):
    return doc.get('gemeentenaam') in ('Nissewaard', 'Voorne aan Zee') or (
        doc.get('gemeentenaam') == 'Rotterdam' and doc.get('woonplaatsnaam') in
        ('Rozenburg', 'Pernis Rotterdam', 'Pernis', 'Hoogvliet Rotterdam', 'Hoogvliet'))


def fields(row):
    return {re.sub('[^a-z0-9]', '', k.lower()): (v or '').strip() for k, v in row.items() if k}


def identity(row):
    r = fields(row)
    pc = r.get('postcode', '').replace(' ', '').upper()
    bag = next((r.get(k) for k in ('bagverblijfsobjectid', 'bagligplaatsid', 'bagstandplaatsid') if r.get(k)), None)
    address = ':'.join([pc, r.get('huisnummer', ''), r.get('huisletter', '').upper(), r.get('huisnummertoevoeging', '').upper()])
    detail = r.get('detailaanduiding', '')
    return (('bag:' + bag) if bag else ('address:' + address)) + ':' + detail, bag, pc


def normalize(row):
    r = fields(row)
    obj, bag, pc = identity(row)
    if not candidate(pc) or r.get('gebouwklasse') != 'W':
        return None
    # EP-Online also publishes energy-performance calculations without a label.
    if not r.get('energieklasse'):
        return None
    inspected = date_value(r.get('opnamedatum'))
    registered = date_value(r.get('registratiedatum'))
    if not inspected or not registered or not re.fullmatch(r'A\+{0,5}|[B-G]', r.get('energieklasse', '')):
        raise ValueError('Incomplete residential label in work area')
    return {'objectKey': obj, 'bagId': bag, 'postcode': pc, 'houseNumber': r.get('huisnummer'),
            'houseLetter': r.get('huisletter') or None, 'houseAddition': r.get('huisnummertoevoeging') or None,
            'detail': r.get('detailaanduiding') or None, 'label': r['energieklasse'],
            'buildingType': r.get('gebouwtype') or None, 'buildingStatus': r.get('status') or None,
            'registeredAt': registered, 'inspectedAt': inspected, 'validUntil': date_value(r.get('geldigtot'))}


def open_db(path):
    db = sqlite3.connect(path)
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS labels (object_key TEXT PRIMARY KEY,payload TEXT NOT NULL,active INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS signals (source_key TEXT PRIMARY KEY,object_key TEXT NOT NULL,payload TEXT NOT NULL,dirty INTEGER NOT NULL DEFAULT 1);
    CREATE INDEX IF NOT EXISTS signals_object ON signals(object_key);
    CREATE TABLE IF NOT EXISTS address_cache (postcode TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at TEXT NOT NULL);
    ''')
    return db


def state_get(db, key, default=None):
    r = db.execute('SELECT value FROM state WHERE key=?', (key,)).fetchone()
    return json.loads(r[0]) if r else default


def state_set(db, key, value):
    db.execute('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, json.dumps(value)))


def store_signal(db, s):
    db.execute('INSERT INTO signals VALUES(?,?,?,1) ON CONFLICT(source_key) DO UPDATE SET payload=excluded.payload,dirty=1', (s['sourceKey'], s['objectKey'], json.dumps(s)))


def deactivate(db, obj):
    db.execute('UPDATE labels SET active=0 WHERE object_key=?', (obj,))
    for (raw,) in db.execute('SELECT payload FROM signals WHERE object_key=?', (obj,)).fetchall():
        s = json.loads(raw)
        if s['current']:
            s['current'] = False
            store_signal(db, s)


def apply_label(db, label, source_date, baseline, now):
    obj = label['objectKey']
    old = db.execute('SELECT payload FROM labels WHERE object_key=?', (obj,)).fetchone()
    previous = json.loads(old[0]) if old else None
    db.execute('INSERT INTO labels VALUES(?,?,1) ON CONFLICT(object_key) DO UPDATE SET payload=excluded.payload,active=1', (obj, json.dumps(label)))
    key = hashlib.sha256((obj + ':' + label['inspectedAt']).encode()).hexdigest()
    found = db.execute('SELECT payload FROM signals WHERE source_key=?', (key,)).fetchone()
    # Snapshot history is not reconstructed as if we had observed it in real time.
    if not found and dt.date.fromisoformat(label['registeredAt']) < dt.date.fromisoformat(now[:10]) - dt.timedelta(days=90):
        return
    for (raw,) in db.execute('SELECT payload FROM signals WHERE object_key=? AND source_key<>?', (obj, key)).fetchall():
        older = json.loads(raw)
        if older['current']:
            older['current'] = False
            store_signal(db, older)
    if found:
        s = json.loads(found[0])
        s.update(label)
        s.update(current=True, sourceDate=source_date)
    else:
        s = dict(label, sourceKey=key, detectedAt=now, baseline=baseline, current=True,
                 previousLabel=previous['label'] if previous else None, sourceDate=source_date,
                 areaStatus='pending', city=None, street=None, municipality=None)
    store_signal(db, s)


class Monitor:
    def __init__(self, config, directory):
        self.config = config
        self.directory = directory
        self.db = open_db(directory / 'monitor.sqlite')
        self.started = stamp()

    def request_json(self, url, headers=None, body=None):
        data = json.dumps(body).encode() if body is not None else None
        headers = dict(headers or {})
        if data is not None:
            headers['Content-Type'] = 'application/json'
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=120) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError('HTTP status ' + str(e.code)) from None
            except (TimeoutError, urllib.error.URLError):
                if attempt == 2:
                    raise RuntimeError('Network timeout/unavailable') from None
            time.sleep(2 ** attempt)

    def info(self, day=None):
        url = API + '/Mutatiebestand/DownloadInfo' + ('/' + day if day else '?fileType=csv')
        try:
            return self.request_json(url, {'Authorization': self.config['apiKey']})
        except RuntimeError as e:
            if str(e) == 'HTTP status 404':
                return None
            raise

    def download(self, info):
        name = info['bestandsnaam']
        if Path(name).name != name or not name.endswith('.zip'):
            raise RuntimeError('Unexpected source filename')
        target = self.directory / name
        if target.exists() and zipfile.is_zipfile(target):
            return target
        url = info['downloadUrl']
        if urllib.parse.urlparse(url).scheme != 'https':
            raise RuntimeError('Insecure source download URL')
        tmp = target.with_suffix('.part')
        try:
            with urllib.request.urlopen(url, timeout=180) as source, tmp.open('wb') as out:
                shutil.copyfileobj(source, out)
            if not zipfile.is_zipfile(tmp):
                raise RuntimeError('Source is not a ZIP archive')
            tmp.replace(target)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise RuntimeError('Source download failed') from None
        return target

    def snapshot(self, info):
        path = self.download(info)
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.endswith('.csv')]
            if len(names) != 1:
                raise RuntimeError('Expected one CSV member')
            with archive.open(names[0]) as raw:
                stream = io.TextIOWrapper(raw, encoding='utf-8-sig', newline='')
                reader = csv.reader(stream, delimiter=';')
                publication = next(reader)
                sequence = next(reader)
                if publication[0] != 'PublicatieDatum' or sequence[0] != 'LaatstVerwerkteMutatievolgnummer':
                    raise RuntimeError('Unexpected snapshot metadata')
                day = date_value(publication[1])
                header = next(reader)
                self.db.execute('DROP TABLE IF EXISTS snapshot_labels')
                self.db.execute('CREATE TABLE snapshot_labels(object_key TEXT PRIMARY KEY,payload TEXT NOT NULL)')
                count = 0
                for cells in reader:
                    row = dict(zip(header, cells))
                    # Avoid normalizing millions of out-of-region records.
                    if not candidate(row.get('Postcode', '').strip()) or row.get('Gebouwklasse') != 'W':
                        continue
                    label = normalize(row)
                    if label:
                        self.db.execute('INSERT OR REPLACE INTO snapshot_labels VALUES(?,?)', (label['objectKey'], json.dumps(label)))
                        count += 1
                through = (dt.date.fromisoformat(day) - dt.timedelta(days=1)).isoformat()
                prior = state_get(self.db, 'throughDate')
                if prior and prior < through:
                    state_set(self.db, 'historyGap', True)
                for (obj,) in self.db.execute('SELECT object_key FROM labels WHERE active=1 AND object_key NOT IN (SELECT object_key FROM snapshot_labels)').fetchall():
                    deactivate(self.db, obj)
                for (raw,) in self.db.execute('SELECT payload FROM snapshot_labels').fetchall():
                    apply_label(self.db, json.loads(raw), through, True, self.started)
                state_set(self.db, 'throughDate', through)
                state_set(self.db, 'sequence', int(sequence[1]))
                state_set(self.db, 'totalFile', info['bestandsnaam'])
                self.db.execute('DROP TABLE snapshot_labels')
                self.db.commit()
                print(json.dumps({'snapshot': info['bestandsnaam'], 'regionalLabels': count}), flush=True)

    def day(self, info, date, baseline):
        path = self.download(info)
        seq = state_get(self.db, 'sequence')
        with zipfile.ZipFile(path) as archive:
            names = [n for n in archive.namelist() if n.endswith('.xml')]
            if len(names) != 1:
                raise RuntimeError('Expected one XML member')
            # Real files can overlap the monthly snapshot and are not always sorted.
            root = ET.fromstring(archive.read(names[0]))
            messages = [e for e in root.iter() if e.tag.split('}')[-1] == 'Mutatiebericht']
            records = []
            for element in messages:
                direct = {e.tag.split('}')[-1]: e for e in element}
                records.append((int(direct['Mutatievolgnummer'].text), direct))
            if len({n for n, _ in records}) != len(records):
                raise RuntimeError('Duplicate source sequence number')
            for n, direct in sorted(records, key=lambda item: item[0]):
                if seq is not None and n <= seq:
                    continue  # Already included in the monthly snapshot / checkpoint.
                if seq is not None and n != seq + 1:
                    self.db.rollback()
                    raise RuntimeError('Sequence gap; source history incomplete')
                seq = n
                row = {e.tag.split('}')[-1]: e.text for e in direct['Pandcertificaat'] if len(e) == 0}
                obj, _, pc = identity(row)
                code = direct['Stuurcode'].text
                if code not in ('1', '2'):
                    raise RuntimeError('Unknown source mutation code')
                if candidate(pc):
                    if code == '2':
                        deactivate(self.db, obj)
                    else:
                        label = normalize(row)
                        if label:
                            apply_label(self.db, label, date, baseline, self.started)
        state_set(self.db, 'sequence', seq)
        state_set(self.db, 'throughDate', date)
        self.db.commit()
        print(json.dumps({'processed': date}), flush=True)

    def address_docs(self, postcode):
        cached = self.db.execute('SELECT payload,fetched_at FROM address_cache WHERE postcode=?', (postcode,)).fetchone()
        if cached and cached[1] > (dt.datetime.now(UTC) - dt.timedelta(days=30)).isoformat():
            return json.loads(cached[0])
        docs, start = [], 0
        while True:
            params = urllib.parse.urlencode({'q': '*:*', 'fq': 'type:adres AND postcode:' + postcode, 'rows': 100, 'start': start,
                'fl': 'postcode,huisnummer,huisletter,huisnummertoevoeging,adresseerbaarobject_id,straatnaam,woonplaatsnaam,gemeentenaam'})
            result = self.request_json(PDOK + '?' + params)['response']
            docs.extend(result['docs'])
            start += len(result['docs'])
            if start >= result['numFound'] or not result['docs']:
                break
        self.db.execute('INSERT OR REPLACE INTO address_cache VALUES(?,?,?)', (postcode, json.dumps(docs), stamp()))
        time.sleep(0.1)
        return docs

    def resolve_addresses(self):
        unresolved = self.db.execute('SELECT payload FROM signals WHERE json_extract(payload,"$.areaStatus")="pending"').fetchall()
        failures = 0
        for (raw,) in unresolved:
            s = json.loads(raw)
            if s.get('detail'):
                continue
            try:
                docs = self.address_docs(s['postcode'])
            except RuntimeError:
                failures += 1
                if failures >= 5:
                    break
                continue
            def exact(d):
                return (str(d.get('huisnummer', '')) == s['houseNumber'] and
                        str(d.get('huisletter', '')).upper() == (s.get('houseLetter') or '').upper() and
                        str(d.get('huisnummertoevoeging', '')).upper() == (s.get('houseAddition') or '').upper())
            matches = [d for d in docs if exact(d) and (not s.get('bagId') or d.get('adresseerbaarobject_id') == s['bagId'])]
            if len(matches) == 1:
                d = matches[0]
                s.update(street=d.get('straatnaam'), city=d.get('woonplaatsnaam'), municipality=d.get('gemeentenaam'),
                         areaStatus='matched' if in_area(d) else 'outside')
                store_signal(self.db, s)
            self.db.commit()
        return failures

    def post(self, body):
        return self.request_json(self.config['platformUrl'].rstrip('/') + '/api/energy-labels/ingest', {'x-webhook-secret': self.config['webhookSecret']}, body)

    def flush(self):
        while True:
            rows = self.db.execute('SELECT source_key,payload FROM signals WHERE dirty=1 LIMIT 100').fetchall()
            if not rows:
                return
            self.post({'signals': [json.loads(r[1]) for r in rows]})
            self.db.executemany('UPDATE signals SET dirty=0 WHERE source_key=?', [(r[0],) for r in rows])
            self.db.commit()

    def health(self, status, error=None):
        return {'status': status, 'error': error, 'lastSuccessAt': state_get(self.db, 'lastSuccessAt'),
                'throughDate': state_get(self.db, 'throughDate'), 'totalFile': state_get(self.db, 'totalFile'),
                'historyGap': state_get(self.db, 'historyGap', False),
                'pendingAddresses': self.db.execute('SELECT count(*) FROM signals WHERE json_extract(payload,"$.areaStatus")="pending"').fetchone()[0],
                'currentLabels': self.db.execute('SELECT count(*) FROM labels WHERE active=1').fetchone()[0]}

    def run(self):
        try:
            info = self.info()
            if not info:
                raise RuntimeError('No source snapshot available')
            bootstrap = not state_get(self.db, 'initialized', False)
            if state_get(self.db, 'totalFile') != info['bestandsnaam']:
                self.snapshot(info)
            today = dt.datetime.now(ZoneInfo('Europe/Amsterdam')).date()
            day = dt.date.fromisoformat(state_get(self.db, 'throughDate')) + dt.timedelta(days=1)
            while day < today:
                daily = self.info(day.isoformat())
                if not daily:
                    break  # Do not skip missing days or claim an empty successful day.
                self.day(daily, day.isoformat(), bootstrap)
                day += dt.timedelta(days=1)
            failed = self.resolve_addresses()
            self.flush()
            # Keep the source checkpoint even when final reconciliation needs a retry.
            health = self.health('attention' if failed else 'ok')
            health['lastSuccessAt'] = stamp()
            self.post({'signals': [], 'complete': True, 'health': health})
            state_set(self.db, 'lastSuccessAt', health['lastSuccessAt'])
            state_set(self.db, 'initialized', True)
            cutoff = (dt.datetime.now(UTC) - dt.timedelta(days=366)).isoformat()
            self.db.execute('DELETE FROM signals WHERE dirty=0 AND json_extract(payload,"$.detectedAt")<?', (cutoff,))
            self.db.commit()
            for file in self.directory.glob('*.zip'):
                if file.name != state_get(self.db, 'totalFile') and file.stat().st_mtime < time.time() - 40*86400:
                    file.unlink()
            print(json.dumps({'result': 'success', **health}), flush=True)
        except Exception as e:
            self.db.rollback()
            # Never include HTTP request URLs, response bodies or credential values.
            message = str(e) if isinstance(e, RuntimeError) else type(e).__name__
            try:
                self.post({'signals': [], 'health': self.health('failed', message)})
            except Exception:
                pass
            print(json.dumps({'result': 'failed', 'error': message}), flush=True)
            return 1
        return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=Path.home()/'.config/energy-label-monitor.json')
    parser.add_argument('--state-dir', type=Path, default=Path.home()/'.local/share/energy-label-monitor')
    args = parser.parse_args()
    os.umask(0o077)
    args.state_dir.mkdir(parents=True, exist_ok=True)
    with (args.state_dir/'run.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Already running')
            return 0
        config = json.loads(args.config.read_text())
        return Monitor(config, args.state_dir).run()


if __name__ == '__main__':
    raise SystemExit(main())
