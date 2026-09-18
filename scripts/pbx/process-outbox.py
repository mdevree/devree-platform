#!/usr/bin/python3
"""Run as root timer; read only the PBX secret and send it to loopback."""
import json,urllib.request
from pathlib import Path
values={}
for line in Path('/home/DeVreeMakelaardij/stacks/devree-platform/.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  key,value=line.split('=',1);values[key.strip()]=value.strip().strip('"').strip("'")
req=urllib.request.Request('http://127.0.0.1:3100/api/pbx/outbox/process',data=b'{}',headers={'Authorization':'Bearer '+values['PBX_SERVICE_SECRET'],'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=90) as result:
 data=json.load(result)
 print(json.dumps(data))
