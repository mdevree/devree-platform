#!/usr/bin/env python3
import csv
import io
import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError


def load_env(path='/opt/devree-ai-bridge/.env'):
    if not os.path.exists(path):
        return
    for raw in open(path, encoding='utf-8'):
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
WEBHOOK_SECRET = os.getenv('WEBHOOK_SECRET', '')
PLATFORM_RESULT_URL = os.getenv('PLATFORM_RESULT_URL', 'https://kantoor.devreemakelaardij.nl/api/ai/call-results')
DB_PATH = os.getenv('DB_PATH', '/root/Asterisk-AI-Voice-Agent/data/call_history.db')
DEFAULT_CONTEXT = os.getenv('DEFAULT_CONTEXT', 'devree_bezichtiging_followup')
LISTEN_HOST = os.getenv('LISTEN_HOST', '0.0.0.0')
LISTEN_PORT = int(os.getenv('LISTEN_PORT', '3099'))


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def connect():
    con = sqlite3.connect(DB_PATH, timeout=20)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA busy_timeout=5000')
    return con


def ensure_bridge_table():
    with connect() as con:
        con.execute('''
            CREATE TABLE IF NOT EXISTS devree_ai_bridge_results (
                attempt_id TEXT PRIMARY KEY,
                ai_call_job_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                sent_at_utc TEXT,
                last_error TEXT,
                created_at_utc TEXT NOT NULL
            )
        ''')
        con.commit()


def clean_phone(phone):
    raw = str(phone or '').strip()
    keep = ''.join(ch for ch in raw if ch.isdigit() or ch in '+*#')
    if not keep:
        raise ValueError('contactPhone ontbreekt of is ongeldig')
    return keep


def validate_approval(approval):
    if not isinstance(approval, dict):
        raise ValueError('approval ontbreekt')
    if approval.get('humanApproved') is not True:
        raise ValueError('menselijke goedkeuring ontbreekt')
    if approval.get('approvalText') != 'BEL':
        raise ValueError('approvalText moet exact BEL zijn')
    if not approval.get('reviewedBy'):
        raise ValueError('reviewedBy ontbreekt')


def make_summary(job, attempt, record, transcript):
    name = job.get('contactName') or 'Onbekende klant'
    prop = job.get('propertyTitle') or job.get('propertyAddress') or 'onbekende woning'
    outcome = (attempt.get('outcome') if attempt else None) or (record.get('outcome') if record else None) or 'completed'
    if transcript:
        return f"AI-belgesprek afgerond met {name} over {prop}. Outcome: {outcome}. Zie transcript voor details."
    err = attempt.get('error_message') if attempt else None
    return f"AI-belgesprek afgerond met {name} over {prop}. Outcome: {outcome}.{(' Foutmelding: ' + err) if err else ''}"


def conversation_to_transcript(raw):
    if not raw:
        return ''
    try:
        data = json.loads(raw)
    except Exception:
        return str(raw)
    lines = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            role = item.get('role') or item.get('speaker') or item.get('type') or 'unknown'
            text = item.get('content') or item.get('text') or item.get('transcript') or ''
            if isinstance(text, list):
                text = ' '.join(str(x) for x in text)
            text = str(text).strip()
            if text:
                lines.append(f"{role}: {text}")
    elif isinstance(data, dict):
        for key in ('messages', 'conversation', 'turns'):
            if isinstance(data.get(key), list):
                return conversation_to_transcript(json.dumps(data[key]))
        return json.dumps(data, ensure_ascii=False, indent=2)
    return '\n'.join(lines)


def transcript_lines(transcript):
    lines = []
    for raw in (transcript or '').splitlines():
        if ':' not in raw:
            continue
        role, text = raw.split(':', 1)
        lines.append((role.strip().lower(), text.strip()))
    return lines


def extract_call_insights(transcript, custom):
    questions = []
    follow_up = {}
    links = []
    user_requested_info = False
    assistant_promised_info = False
    technical_topic = None

    technical_terms = (
        'kwaaitaal', 'kwijtaal', 'vloer', 'kruipruimte', 'asbest', 'fundering',
        'bouwkundig', 'vve', 'vergunning', 'dak', 'constructie',
    )
    info_terms = ('stuur', 'link', 'informatie', 'details', 'opsturen', 'nasturen')

    for role, text in transcript_lines(transcript):
        lower = text.lower()
        if role == 'user':
            is_question = '?' in text or any(term in lower for term in ('weten of', 'was dat', 'is dat', 'vraag', 'vragen'))
            if is_question or any(term in lower for term in technical_terms):
                if text not in questions:
                    questions.append(text)
            if any(term in lower for term in info_terms):
                user_requested_info = True
            for term in technical_terms:
                if term in lower:
                    technical_topic = term
                    break
        elif role == 'assistant':
            if any(phrase in lower for phrase in ('ik stuur', 'ik zal', 'meesturen', 'nasturen')):
                assistant_promised_info = True

    property_url = (custom or {}).get('propertyUrl')
    if property_url:
        links.append({
            'title': (custom or {}).get('propertyTitle') or (custom or {}).get('propertyAddress') or 'Woningpagina',
            'url': property_url,
            'purpose': 'woninginformatie',
        })

    if user_requested_info or assistant_promised_info or questions:
        description = 'Klantvraag opvolgen'
        if technical_topic:
            description = f'Technische/objectspecifieke vraag opvolgen: {technical_topic}'
        elif questions:
            description = questions[0]
        follow_up = {
            'type': 'collega_opvolging',
            'requiresHuman': True,
            'description': description,
            'note': 'Alleen concrete links toesturen als ze beschikbaar en gecontroleerd zijn.',
        }

    return {
        'customerQuestions': questions[:8],
        'requestedFollowUp': follow_up,
        'proposedLinks': links,
    }


def map_outcome(attempt, record):
    raw = ((attempt or {}).get('outcome') or (record or {}).get('outcome') or '').lower()
    amd = ((attempt or {}).get('amd_status') or '').lower()
    err = ((attempt or {}).get('error_message') or '').lower()
    if 'machine' in amd or 'voicemail' in raw:
        return 'voicemail'
    if 'no_answer' in raw or 'no answer' in raw or 'busy' in raw:
        return 'no_answer'
    if 'error' in raw or 'fail' in raw or err:
        return 'failed'
    return 'answered'


def create_one_call_campaign(job):
    job_id = str(job.get('id') or '').strip()
    if not job_id:
        raise ValueError('job.id ontbreekt')
    phone = clean_phone(job.get('contactPhone'))
    campaign_id = str(uuid.uuid4())
    lead_id = str(uuid.uuid4())
    now = utcnow()
    name = f"De Vree AI - {job.get('contactName') or job_id}"
    custom = {
        'aiCallJobId': job_id,
        'source': 'devree-platform',
        'contactName': job.get('contactName'),
        'propertyTitle': job.get('propertyTitle'),
        'propertyAddress': job.get('propertyAddress'),
        'propertyUrl': job.get('propertyUrl'),
        'viewingDate': job.get('viewingDate'),
        'scriptPreview': job.get('scriptPreview'),
        'context': job.get('context'),
        'instructions': 'Gebruik deze context als gespreksbriefing. Vat aan het einde samen, vraag of het klopt en hang daarna zelf op.'
    }
    with connect() as con:
        existing = con.execute(
            """
            SELECT c.id AS campaign_id, l.id AS lead_id, c.status AS status
            FROM outbound_campaigns c
            JOIN outbound_leads l ON l.campaign_id = c.id
            WHERE json_extract(l.custom_vars_json, '$.aiCallJobId') = ?
            ORDER BY c.created_at_utc DESC LIMIT 1
            """,
            (job_id,),
        ).fetchone()
        if existing:
            return {'queued': True, 'duplicate': True, 'campaignId': existing['campaign_id'], 'leadId': existing['lead_id'], 'status': existing['status']}
        con.execute(
            """
            INSERT INTO outbound_campaigns (
                id, name, status, timezone, run_start_at_utc, run_end_at_utc,
                daily_window_start_local, daily_window_end_local, max_concurrent,
                min_interval_seconds_between_calls, default_context,
                voicemail_drop_enabled, voicemail_drop_mode, voicemail_drop_text,
                voicemail_drop_media_uri, consent_enabled, consent_media_uri,
                consent_timeout_seconds, amd_options_json, created_at_utc, updated_at_utc
            ) VALUES (?, ?, 'running', 'Europe/Amsterdam', NULL, NULL, '00:00', '23:59', 1, 0, ?, 0, 'tts', NULL, NULL, 0, NULL, 5, '{}', ?, ?)
            """,
            (campaign_id, name[:180], DEFAULT_CONTEXT, now, now),
        )
        con.execute(
            """
            INSERT INTO outbound_leads (
                id, campaign_id, name, phone_number, lead_timezone, context_override,
                caller_id_override, custom_vars_json, state, attempt_count,
                last_outcome, last_attempt_at_utc, leased_until_utc, created_at_utc, updated_at_utc
            ) VALUES (?, ?, ?, ?, 'Europe/Amsterdam', ?, NULL, ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
            """,
            (lead_id, campaign_id, job.get('contactName'), phone, DEFAULT_CONTEXT, json.dumps(custom, ensure_ascii=False), now, now),
        )
        con.commit()
    return {'queued': True, 'campaignId': campaign_id, 'leadId': lead_id, 'context': DEFAULT_CONTEXT}


def post_result(payload):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = urlrequest.Request(
        PLATFORM_RESULT_URL,
        data=data,
        method='POST',
        headers={'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET},
    )
    with urlrequest.urlopen(req, timeout=20) as resp:
        body = resp.read().decode('utf-8', errors='replace')
        if resp.status >= 300:
            raise RuntimeError(f'platform status {resp.status}: {body[:500]}')
        return body


def poll_results_once():
    ensure_bridge_table()
    with connect() as con:
        rows = con.execute(
            """
            SELECT a.*, l.custom_vars_json, l.name AS lead_name, l.phone_number, c.name AS campaign_name, r.id AS record_id,
                   r.call_id, r.duration_seconds AS record_duration_seconds, r.provider_name, r.context_name AS record_context_name,
                   r.conversation_history, r.outcome AS record_outcome, r.error_message AS record_error_message
            FROM outbound_attempts a
            JOIN outbound_leads l ON l.id = a.lead_id
            JOIN outbound_campaigns c ON c.id = a.campaign_id
            LEFT JOIN call_records r ON r.call_id = a.call_history_call_id OR r.id = a.call_history_call_id
            LEFT JOIN devree_ai_bridge_results b ON b.attempt_id = a.id
            WHERE a.ended_at_utc IS NOT NULL
              AND b.attempt_id IS NULL
              AND json_extract(l.custom_vars_json, '$.aiCallJobId') IS NOT NULL
            ORDER BY a.ended_at_utc ASC
            LIMIT 10
            """
        ).fetchall()
    for row in rows:
        d = dict(row)
        try:
            custom = json.loads(d.get('custom_vars_json') or '{}')
            job_id = custom.get('aiCallJobId')
            if not job_id:
                continue
            transcript = conversation_to_transcript(d.get('conversation_history'))
            insights = extract_call_insights(transcript, custom)
            payload = {
                'aiCallJobId': job_id,
                'pbxCallId': d.get('call_id') or d.get('ari_channel_id') or d.get('id'),
                'provider': d.get('provider') or d.get('provider_name') or 'asterisk-ai-voice-agent',
                'contextName': d.get('context') or d.get('record_context_name') or DEFAULT_CONTEXT,
                'durationSeconds': int(d.get('record_duration_seconds') or d.get('duration_seconds') or 0) or None,
                'outcome': map_outcome(d, {'outcome': d.get('record_outcome')}),
                'summary': make_summary(custom, d, {'outcome': d.get('record_outcome')}, transcript),
                'transcript': transcript or None,
                'customerQuestions': insights['customerQuestions'],
                'detectedOpportunities': [],
                'requestedFollowUp': insights['requestedFollowUp'],
                'proposedLinks': insights['proposedLinks'],
                'audioNotes': d.get('error_message') or d.get('record_error_message') or None,
                'qualityScore': None,
            }
            post_result(payload)
            status, err = 'sent', None
        except Exception as exc:
            status, err = 'failed', str(exc)[:1000]
        with connect() as con:
            con.execute(
                "INSERT OR REPLACE INTO devree_ai_bridge_results (attempt_id, ai_call_job_id, status, sent_at_utc, last_error, created_at_utc) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at_utc FROM devree_ai_bridge_results WHERE attempt_id=?), ?))",
                (d.get('id'), (json.loads(d.get('custom_vars_json') or '{}')).get('aiCallJobId', ''), status, utcnow() if status == 'sent' else None, err, d.get('id'), utcnow()),
            )
            con.commit()


class Handler(BaseHTTPRequestHandler):
    server_version = 'DevreeAIBridge/1.0'

    def _json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self._json(200, {'ok': True, 'context': DEFAULT_CONTEXT})
        return self._json(404, {'error': 'not_found'})

    def do_POST(self):
        if self.path != '/start':
            return self._json(404, {'error': 'not_found'})
        if WEBHOOK_SECRET and self.headers.get('x-webhook-secret') != WEBHOOK_SECRET:
            return self._json(401, {'error': 'unauthorized'})
        try:
            length = int(self.headers.get('content-length') or '0')
            body = json.loads(self.rfile.read(length).decode('utf-8')) if length else {}
            validate_approval(body.get('approval'))
            job = body.get('job') or body
            result = create_one_call_campaign(job)
            return self._json(200, result)
        except Exception as exc:
            return self._json(400, {'error': str(exc)})

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args), flush=True)


def poll_loop():
    while True:
        try:
            poll_results_once()
        except Exception as exc:
            print('poll error:', exc, flush=True)
        time.sleep(10)


def main():
    ensure_bridge_table()
    threading.Thread(target=poll_loop, daemon=True).start()
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    print(f'Devree AI bridge listening on {LISTEN_HOST}:{LISTEN_PORT}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
