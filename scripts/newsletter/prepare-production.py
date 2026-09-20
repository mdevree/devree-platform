#!/usr/bin/env python3
"""Run as root on the existing platform host before deploying. Never sends mail."""
import datetime, json, os, pathlib, shutil, subprocess
stack = pathlib.Path('/home/DeVreeMakelaardij/stacks/devree-platform')
backup = stack / 'backups' / ('faq-newsletter-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(mode=0o700, parents=True)
os.chmod(backup, 0o700)
for name in ['docker-compose.yml', '.env']:
    if (stack/name).exists(): shutil.copy2(stack/name, backup/name)
with (backup/'newsletter-before.sql').open('wb') as out:
    subprocess.run(['mysqldump','--single-transaction','DeVreeMakelaardij_platform','newsletter_items','newsletter_issues','newsletter_blocks','_prisma_migrations'],stdout=out,check=True)
os.chmod(backup/'newsletter-before.sql',0o600)
# Obtain the existing Matomo token without exposing it or creating a second temporary secret file.
token = subprocess.check_output(['runuser','-u','DeVreeMakelaardij','--','/usr/local/bin/wp','--path=/home/DeVreeMakelaardij/web/devreemakelaardij.nl/public_html','option','get','wp-piwik_global-piwik_token'],stderr=subprocess.DEVNULL,text=True).strip()
assert token and '\n' not in token
node = r'''
(async()=>{
 const base=process.env.MAUTIC_URL||'https://connect.devreemakelaardij.nl';
 const auth=await fetch(base+'/oauth/v2/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:process.env.MAUTIC_CLIENT_ID,client_secret:process.env.MAUTIC_CLIENT_SECRET})});
 if(!auth.ok)throw new Error('OAuth unavailable'); const token=(await auth.json()).access_token;
 async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('Mautic HTTP '+r.status);return r.json();}
 // An unpublished custom field is silently ignored by the contact edit API.
 const fields=Object.values((await api('/api/fields/contact?limit=500')).fields||{}).filter(f=>f.alias==='nieuwsbrief');
 if(fields.length!==1||fields[0].type!=='boolean'||!fields[0].isPublished)throw new Error('Activate the existing boolean nieuwsbrief contact field before enabling signup');
 const name='Nieuwsbrief welkom [dv:faq-welcome-v1]';
 const found=await api('/api/emails?search='+encodeURIComponent('[dv:faq-welcome-v1]')+'&limit=100');
 const matches=Object.values(found.emails||{}).filter(e=>e.name===name);
 if(matches.length>1)throw new Error('Duplicate welcome templates');
 let email=matches[0];
 if(!email)email=(await api('/api/emails/new',{name,subject:'Bedankt voor uw aanmelding',emailType:'template',isPublished:false,language:'nl',fromName:'De Vree Makelaardij',fromAddress:'info@devreemakelaardij.nl',replyToAddress:'info@devreemakelaardij.nl',customHtml:'<!doctype html><html lang="nl"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#17291f;line-height:1.6;max-width:600px;margin:32px auto;padding:20px"><h1 style="font-size:24px">Bedankt voor uw aanmelding</h1><p>U bent aangemeld voor de nieuwsbrief van De Vree Makelaardij.</p><p>{newsletter_consent}</p><p><a href="{unsubscribe_url}" style="background:#03543d;color:white;padding:12px 18px;display:inline-block;text-decoration:none">Afmelden</a></p><p>Wilt u geen nieuwsbrief ontvangen? U kunt zich hierboven afmelden.</p><p>De Vree Makelaardij</p></body></html>',plainText:'U bent aangemeld voor de nieuwsbrief van De Vree Makelaardij.\n\n{newsletter_consent}\n\nAfmelden: {unsubscribe_url}\n\nWilt u geen nieuwsbrief ontvangen? U kunt zich hierboven afmelden.',sendToDnc:false})).email;
 const check=(await api('/api/emails/'+email.id)).email;
 if(check.emailType!=='template'||check.isPublished||!check.customHtml.includes('{unsubscribe_url}'))throw new Error('Welcome template validation failed');
 console.log(JSON.stringify({id:check.id,isPublished:check.isPublished,type:check.emailType}));
})().catch(()=>{console.error('Welcome setup failed; verify the active nieuwsbrief field and welcome template');process.exitCode=1;});
'''
result = subprocess.check_output(['docker','exec','-i','devree-platform','node'],input=node,text=True)
email=json.loads(result)
values={'MATOMO_API_TOKEN':token,'NEWSLETTER_WELCOME_EMAIL_ID':str(email['id']),'NEWSLETTER_SIGNUP_ENABLED':'true','NEWSLETTER_PUBLIC_ORIGIN':'https://kantoor.devreemakelaardij.nl'}
env_path=stack/'.env'; lines=env_path.read_text().splitlines() if env_path.exists() else []
lines=[line for line in lines if line.split('=',1)[0] not in values]
lines.extend(k+'='+v for k,v in values.items())
env_path.write_text('\n'.join(lines)+'\n');os.chmod(env_path,0o600)
import yaml
config=yaml.safe_load((stack/'docker-compose.yml').read_text())
assert '.env' in config['services']['devree-platform']['env_file'], 'Existing env_file configuration changed'
print(json.dumps({'backup':str(backup),'welcomeTemplate':email,'configured':list(values)}))
