#!/usr/bin/python3
"""Preserve the active WAHA session configuration and add the office webhook."""
import datetime,json,subprocess,urllib.request
from pathlib import Path
container=json.loads(subprocess.check_output(['docker','inspect','devree-platform']))[0]
env=dict(s.split('=',1) for s in container['Config']['Env'] if '=' in s)
base=env['WAHA_API_URL'].rstrip('/')
name=env.get('WAHA_SESSION') or 'default'
headers={'X-Api-Key':env['WAHA_API_KEY'],'Content-Type':'application/json'}
def call(method,data=None):
 req=urllib.request.Request(base+'/api/sessions/'+name,data=json.dumps(data).encode() if data else None,headers=headers,method=method)
 with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
old=call('GET')
backup=Path('/home/DeVreeMakelaardij/backups')/('pbx-waha-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700);(backup/'session.json').write_text(json.dumps(old));(backup/'session.json').chmod(0o600)
config=old.get('config') or {}
url=env['NEXTAUTH_URL'].rstrip('/')+'/api/webhooks/whatsapp'
webhooks=config.get('webhooks') or []
ours=next((w for w in webhooks if w.get('url')==url),None)
if ours is None:
 ours={'url':url};webhooks.append(ours)
ours['events']=sorted(set((ours.get('events') or [])+['message.any','message.ack']))
ours['customHeaders']=[h for h in ours.get('customHeaders',[]) if h.get('name','').lower()!='x-webhook-secret']+[{'name':'x-webhook-secret','value':env['WHATSAPP_WEBHOOK_SECRET']}]
ours['retries']={'policy':'exponential','delaySeconds':2,'attempts':10}
config['webhooks']=webhooks
call('PUT',{'name':name,'config':config})
new=call('GET')
verified=next((w for w in (new.get('config') or {}).get('webhooks',[]) if w.get('url')==url),None)
if not verified or not all(e in verified.get('events',[]) for e in ['message.any','message.ack']):raise RuntimeError('Webhook configuration not persisted')
print(json.dumps({'backup':str(backup),'status':new.get('status'),'webhook':url,'events':verified['events']}))
