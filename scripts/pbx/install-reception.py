#!/usr/bin/python3
"""Run on PBX with bundle unpacked in /opt/devree-reception; no inbound edits."""
import datetime,json,os,shutil,subprocess
from pathlib import Path
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=Path('/root/backups')/('pbx-reception-'+stamp);backup.mkdir(mode=0o700)
custom=Path('/etc/asterisk/extensions_custom.conf')
shutil.copy2(custom,backup/custom.name)
existing=subprocess.check_output(['asterisk','-rx','dialplan show 8899@from-internal'],text=True)
if "'8899' =>" in existing:
 if 'devree-reception' not in existing:raise RuntimeError('Test extension already in use')
text=custom.read_text()
include='#include extensions_devree_reception.conf'
if include not in text:text+='\n'+include+'\n'
# Add an include to the existing custom context without declaring it twice.
lines=text.splitlines();target='include => devree-reception-test'
if target not in lines:
 for n,line in enumerate(lines):
  if line.strip()=='[from-internal-custom]':lines.insert(n+1,target);break
 else:lines+=['','[from-internal-custom]',target]
text='\n'.join(lines)+'\n'
shutil.copy2('/opt/devree-reception/extensions_devree_reception.conf','/etc/asterisk/extensions_devree_reception.conf')
custom.write_text(text)
for file in [custom,Path('/etc/asterisk/extensions_devree_reception.conf')]:shutil.chown(file,user='asterisk',group='asterisk');file.chmod(0o640)
state=Path('/var/lib/devree-reception');state.mkdir(mode=0o750,exist_ok=True);shutil.chown(state,user='asterisk',group='asterisk')
sounds=Path('/var/lib/asterisk/sounds/custom/devree-reception');sounds.mkdir(mode=0o755,parents=True,exist_ok=True)
for p in Path('/opt/devree-reception/audio').glob('*.wav'):shutil.copy2(p,sounds/p.name)
Path('/opt/devree-reception/reception.py').chmod(0o755)
shutil.copy2('/opt/devree-reception/devree-reception.service','/etc/systemd/system/devree-reception.service')
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['asterisk','-rx','dialplan reload'],check=True)
subprocess.run(['systemctl','enable','--now','devree-reception.service'],check=True)
print(json.dumps({'backup':str(backup),'testExtension':'8899','publicRouteChanged':False}))
