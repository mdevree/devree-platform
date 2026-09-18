#!/usr/bin/python3
"""Run on platform host once, before deploying the additive migration."""
import datetime,json,os,secrets,shutil,subprocess
from pathlib import Path
from urllib.parse import urlparse
stack=Path('/home/DeVreeMakelaardij/stacks/devree-platform')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=Path('/home/DeVreeMakelaardij/backups')/('pbx-reception-'+stamp)
backup.mkdir(mode=0o700)
for name in ['.env','docker-compose.yml']:shutil.copy2(stack/name,backup/name)
values={}
for line in (stack/'.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);values[k.strip()]=v.strip().strip('"').strip("'")
url=urlparse(values['DATABASE_URL'])
with (backup/'platform.sql').open('wb') as out:
 subprocess.run(['mysqldump','--single-transaction','--routines','--triggers',url.path.lstrip('/')],stdout=out,check=True)
if (backup/'platform.sql').stat().st_size<10000:raise RuntimeError('Backup unexpectedly small')
p=stack/'.env';text=p.read_text()
add={'PBX_SERVICE_SECRET':values.get('PBX_SERVICE_SECRET') or secrets.token_hex(32),'PBX_SEND_MODE':'off','PBX_TEST_NUMBERS':'','PBX_RECORDING_DIR':'/app/uploads/pbx'}
lines=[line for line in text.splitlines() if line.split('=',1)[0] not in add]
p.write_text('\n'.join(lines+[k+'='+v for k,v in add.items()])+'\n');p.chmod(0o600)
p=stack/'docker-compose.yml';text=p.read_text()
if './uploads/pbx:/app/uploads/pbx' not in text:
 text=text.replace('    volumes:\n','    volumes:\n      - ./uploads/pbx:/app/uploads/pbx\n',1);p.write_text(text)
recordings=stack/'uploads/pbx';recordings.mkdir(parents=True,exist_ok=True,mode=0o700);os.chown(recordings,1001,1001)
print(json.dumps({'backup':str(backup),'databaseBackupBytes':(backup/'platform.sql').stat().st_size,'sendMode':'off','recordingVolume':str(recordings)}))
