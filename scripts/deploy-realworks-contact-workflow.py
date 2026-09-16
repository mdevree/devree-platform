"""Run on the n8n host; keep API keys and unredacted backups on that host.

Usage: deploy-realworks-contact-workflow.py preview|candidate|apply BRANCH_JSON
"""
import copy
import datetime
import json
import pathlib
import sqlite3
import sys
import urllib.error
import urllib.request
import uuid

WORKFLOW_ID = 'BXamv0Exk1GFQRE6'
DATABASE = '/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite'


def main():
    mode, branch_path = sys.argv[1:3]
    assert mode in ('preview', 'candidate', 'apply')
    db = sqlite3.connect('file:' + DATABASE + '?mode=ro', uri=True)
    key = db.execute('select apiKey from user_api_keys limit 1').fetchone()[0]

    def api(method, suffix, body=None):
        request = urllib.request.Request(
            'http://127.0.0.1:5678/api/v1/workflows' + suffix,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'X-N8N-API-KEY': key, 'Content-Type': 'application/json'}, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # The public API's validation response does not contain submitted credentials.
            print('n8n API error', error.code, error.read().decode()[:1500])
            raise

    branch = json.loads(pathlib.Path(branch_path).read_text())
    original = api('GET', '/' + WORKFLOW_ID)
    assert original['active'] and original['versionId'] == original['activeVersionId']
    assert original['versionId'] == branch['baseVersionId'], 'Source workflow changed; refresh and review the patch before applying'
    existing = {n['name']: n for n in original['nodes']}
    nodes = copy.deepcopy(branch['nodes'])
    queue = next(n for n in nodes if n['name'] == 'Schrijf naar Realworks Queue')
    # Never export these header values to the workstation or Git.
    queue['parameters']['headerParameters'] = copy.deepcopy(existing[queue['name']]['parameters']['headerParameters'])
    replacing = set(branch['replacedNames']) | {n['name'] for n in nodes}
    updated = copy.deepcopy(original)
    updated['nodes'] = [n for n in updated['nodes'] if n['name'] not in replacing] + nodes
    updated['connections'] = {k: v for k, v in updated['connections'].items() if k not in replacing}
    updated['connections'].update(branch['connections'])
    for name, node in existing.items():
        if name not in replacing:
            assert next(n for n in updated['nodes'] if n['name'] == name) == node
            assert updated['connections'].get(name) == original['connections'].get(name)
    print(json.dumps({'mode': mode, 'originalVersion': original['versionId'],
                      'unaffectedNodes': sum(n['name'] not in replacing for n in original['nodes']),
                      'contactNodes': len(nodes)}))
    if mode == 'preview':
        return

    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup_dir = pathlib.Path('/home/DeVreeMakelaardij/backups/realworks-no-email-' + timestamp)
    backup_dir.mkdir(mode=0o700)
    backup = backup_dir / 'workflow-api.before.json'
    backup.write_text(json.dumps(original, indent=2))
    backup.chmod(0o600)
    assert backup.stat().st_size > 1000

    if mode == 'candidate':
        # Exact contact logic, separate test webhook. Test IDs must never enter the Realworks write queue.
        webhook = next(n for n in nodes if n['name'] == 'Webhook1')
        webhook['parameters']['path'] = 'realworks-contact-check-' + timestamp.lower()
        webhook['webhookId'] = str(uuid.uuid4())
        queue.clear()
        queue.update({'id': 'test-writeback', 'name': 'Schrijf naar Realworks Queue',
                      'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [3000, 944],
                      'parameters': {'jsCode': "return [{json:{success:true,task:{id:'isolated-test-writeback'}}}];"}})
        saved = api('POST', '', {'name': 'Realworks contact-sync verificatie ' + timestamp,
                                'nodes': nodes, 'connections': branch['connections'],
                                'settings': {'executionOrder': 'v1'}})
        api('POST', '/' + saved['id'] + '/activate', {'versionId': saved['versionId']})
        state = {'id': saved['id'], 'path': webhook['parameters']['path'], 'backup': str(backup)}
        state_file = pathlib.Path(branch_path).parent / 'candidate-state.json'
        state_file.write_text(json.dumps(state))
        state_file.chmod(0o600)
        print(json.dumps(state))
        return

    assert api('GET', '/' + WORKFLOW_ID)['versionId'] == original['versionId'], 'Workflow changed during preparation'
    payload = {k: updated[k] for k in ['name', 'nodes', 'connections']}
    # Installed WorkflowService merges settings; internal keys are not accepted by the public API.
    payload['settings'] = {}
    saved = api('PUT', '/' + WORKFLOW_ID, payload)
    if saved.get('activeVersionId') != saved['versionId']:
        api('POST', '/' + WORKFLOW_ID + '/activate', {'versionId': saved['versionId']})
    live = api('GET', '/' + WORKFLOW_ID)
    assert live['active'] and live['activeVersionId'] == live['versionId']
    assert live['nodes'] == updated['nodes']
    assert live['connections'] == updated['connections']
    assert live['settings'] == original['settings']
    published = db.execute('select nodes,connections from workflow_history where versionId=?', (live['activeVersionId'],)).fetchone()
    assert published and json.loads(published[0]) == updated['nodes']
    assert json.loads(published[1]) == updated['connections']
    print(json.dumps({'active': True, 'activeVersionId': live['activeVersionId'], 'backup': str(backup)}))


if __name__ == '__main__':
    main()
