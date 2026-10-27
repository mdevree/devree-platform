#!/usr/bin/env python3
"""Read Postiz analytics and ingest sanitized snapshots. No publishing endpoints."""
import argparse
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DAILY = {'facebook', 'gmb', 'pinterest', 'linkedin-page', 'youtube'}
SUPPORTED = DAILY | {'instagram', 'tiktok', 'linkedin'}


def request_json(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=data, headers={**headers, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f'HTTP {error.code}') from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            if attempt == 2:
                raise RuntimeError('Bron tijdelijk niet beschikbaar') from None
        time.sleep(2 * (attempt + 1))


def clean_metrics(data):
    if not isinstance(data, list) or len(data) > 40:
        return []
    result = []
    for row in data:
        if not isinstance(row, dict) or not isinstance(row.get('label'), str) or not 1 <= len(row['label']) <= 100:
            return []
        if any(metric['label'] == row['label'] for metric in result):
            return []
        points = row.get('data')
        # Some providers return a label with no data property when upstream is empty.
        if points is None:
            points = []
        if not isinstance(points, list) or len(points) > 100:
            return []
        cleaned = []
        for point in points:
            if not isinstance(point, dict):
                return []
            date, total = point.get('date'), point.get('total')
            if not isinstance(date, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                return []
            try:
                datetime.strptime(date, '%Y-%m-%d')
            except ValueError:
                return []
            if isinstance(total, bool) or total is None or (isinstance(total, str) and not re.fullmatch(r'\d+(\.\d+)?', total)):
                return []
            if not isinstance(total, (int, float, str)) or not math.isfinite(float(total)) or not 0 <= float(total) <= 9007199254740991:
                return []
            cleaned.append({'date': date, 'total': total})
        if len({p['date'] for p in cleaned}) != len(cleaned):
            return []
        result.append({'label': row['label'], 'data': cleaned})
    return result


def run(config):
    postiz = config['postizUrl'].rstrip('/')
    platform = config['platformUrl'].rstrip('/')
    if urllib.parse.urlsplit(postiz).hostname != 'postiz.devreemakelaardij.nl' or not postiz.startswith('https://'):
        raise RuntimeError('Ongeldig Postiz-adres')
    if urllib.parse.urlsplit(platform).hostname not in ('127.0.0.1', 'localhost', 'kantoor.devreemakelaardij.nl'):
        raise RuntimeError('Ongeldig platformadres')
    auth = {'Authorization': config['postizApiKey']}
    integrations = request_json(postiz + '/integrations', auth)
    if not isinstance(integrations, list) or len(integrations) > 30:
        raise RuntimeError('Ongeldige kanalenlijst')
    batch = {'capturedAt': datetime.now(timezone.utc).isoformat(), 'channels': [], 'snapshots': []}
    for item in integrations:
        provider = item.get('identifier')
        if provider not in SUPPORTED:
            continue
        channel = {'id': item['id'], 'name': item['name'], 'provider': provider, 'status': 'ok'}
        batch['channels'].append(channel)
        if item.get('disabled'):
            channel['status'] = 'disabled'
            continue
        if provider == 'linkedin':
            channel['status'] = 'unsupported'
            continue
        windows = [65] if provider in DAILY else [7, 30] if provider == 'instagram' else [7]
        for window in windows:
            try:
                data = clean_metrics(request_json(f'{postiz}/analytics/{urllib.parse.quote(item["id"], safe="")}?date={window}', auth))
                if not any(m['data'] for m in data):
                    if channel['status'] == 'ok':
                        channel['status'] = 'empty'
                    continue
                batch['snapshots'].append({'channelId': item['id'], 'windowDays': window, 'metrics': data})
            except RuntimeError:
                channel['status'] = 'error'
    response = request_json(platform + '/api/marketing/ingest', {'x-webhook-secret': config['webhookSecret']}, batch)
    print(json.dumps({'channels': len(batch['channels']), 'snapshots': response.get('accepted'),
                      'status': {c['provider']: c['status'] for c in batch['channels']}}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=Path.home() / '.config/marketing-sync.json')
    args = parser.parse_args()
    try:
        run(json.loads(args.config.read_text()))
    except Exception as error:
        # Never print request headers, URLs with credentials, or raw provider errors.
        print(json.dumps({'ok': False, 'error': str(error) if isinstance(error, RuntimeError) else 'Configuratie of synchronisatie mislukt'}))
        raise SystemExit(1)
