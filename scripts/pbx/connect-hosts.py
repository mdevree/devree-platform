#!/usr/bin/env python3
"""Copy only the dedicated integration credential via SSH pipes, not local disk."""
import json,os,shlex,subprocess
ssh=['ssh','-i',os.path.expanduser('~/.ssh/devree_codex'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes']
read='''import json
from pathlib import Path
v={}
for line in Path('/home/DeVreeMakelaardij/stacks/devree-platform/.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,a=line.split('=',1);v[k.strip()]=a.strip().strip(chr(34)).strip(chr(39))
print(json.dumps({'PBX_SERVICE_SECRET':v['PBX_SERVICE_SECRET'],'PBX_PLATFORM_URL':v['NEXTAUTH_URL'],'PBX_ROUTE_MODE':'test'}))
'''
payload=subprocess.check_output(ssh+['root@136.144.253.219','python3 -c '+shlex.quote(read)])
write='''import json,sys,shutil
from pathlib import Path
v=json.load(sys.stdin)
assert v['PBX_PLATFORM_URL'].startswith('https://')
assert len(v['PBX_SERVICE_SECRET'])>=32
p=Path('/etc/devree-reception.env')
if p.exists():shutil.copy2(p,'/root/backups/devree-reception.env.previous')
p.write_text(''.join(k+'='+a+'\\n' for k,a in v.items()))
p.chmod(0o640);shutil.chown(p,user='root',group='asterisk')
print('Dedicated PBX credential installed; route mode test.')
'''
subprocess.run(ssh+['root@136.144.249.189','python3 -c '+shlex.quote(write)],input=payload,check=True)
