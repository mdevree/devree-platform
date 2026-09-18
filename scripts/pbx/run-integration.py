#!/usr/bin/env python3
"""Create an isolated empty schema over SSH, test, then drop only that schema.
Credentials are passed in memory; never written to files or terminal output.
"""
import json,os,subprocess,tempfile,time
ssh=['ssh','-i',os.path.expanduser('~/.ssh/devree_codex'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@136.144.253.219']
setup='''import json,secrets,subprocess
name='pbx_reception_test_'+secrets.token_hex(4)
user='pbxt_'+secrets.token_hex(4)
password=secrets.token_hex(32)
sql=f"CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER '{user}'@'127.0.0.1' IDENTIFIED BY '{password}'; GRANT ALL ON `{name}`.* TO '{user}'@'127.0.0.1';"
subprocess.run(['mysql'],input=sql,text=True,check=True,capture_output=True)
print(json.dumps(dict(name=name,user=user,password=password)))
'''
creds=json.loads(subprocess.check_output(ssh+['python3 -'],input=setup,text=True))
tunnel=subprocess.Popen(ssh[:-1]+['-N','-L','127.0.0.1:13316:127.0.0.1:3306','-o','ExitOnForwardFailure=yes',ssh[-1]],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 time.sleep(1)
 if tunnel.poll() is not None:raise RuntimeError('SSH tunnel failed')
 env=dict(os.environ,DATABASE_URL=f"mysql://{creds['user']}:{creds['password']}@127.0.0.1:13316/{creds['name']}",PBX_SEND_MODE='off')
 with tempfile.TemporaryDirectory(prefix='pbx-test-recordings-') as recordings:
  env['PBX_RECORDING_DIR']=recordings
  subprocess.run(['npx','prisma','db','push','--skip-generate'],env=env,check=True)
  subprocess.run(['npx','tsx','scripts/pbx/integration-test.ts'],env=env,check=True)
finally:
 tunnel.terminate();tunnel.wait(timeout=10)
 cleanup=f"DROP DATABASE `{creds['name']}`; DROP USER '{creds['user']}'@'127.0.0.1';"
 subprocess.run(ssh+['mysql'],input=cleanup,text=True,check=True,capture_output=True)
 print('Isolated test database and account removed.')
