#!/bin/sh
set -eu
case "${1:-daily}" in daily|monthly) mode="${1:-daily}";; *) exit 2;; esac
# The existing server-to-server secret stays inside the running container.
docker exec -i -e NEWSLETTER_JOB="$mode" devree-platform node <<'JS'
(async()=>{
 try {
  if(!process.env.N8N_WEBHOOK_SECRET)throw new Error('Server-to-server authentication missing');
  const r=await fetch('http://127.0.0.1:3100/api/nieuwsbrief/sync',{method:'POST',headers:{'Content-Type':'application/json','x-webhook-secret':process.env.N8N_WEBHOOK_SECRET},body:JSON.stringify({month:process.env.NEWSLETTER_JOB==='monthly'}),signal:AbortSignal.timeout(300000)});
  if(!r.ok)throw new Error('Newsletter maintenance HTTP '+r.status);
  const result=await r.json();console.log(JSON.stringify(result));
  if(Object.values(result).some(v=>v&&v.ok===false))process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
})();
JS
