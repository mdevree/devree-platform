import test from 'node:test';
import assert from 'node:assert/strict';
import type {PrismaClient} from '@prisma/client';
import {CONSENT_VERSION} from './rules';

test('direct aanmelden, afmeldingen en mislukte welkomstmail',async t=>{
 const oldSecret=process.env.AUTH_SECRET,oldEnabled=process.env.NEWSLETTER_SIGNUP_ENABLED,oldTemplate=process.env.NEWSLETTER_WELCOME_EMAIL_ID;
 process.env.AUTH_SECRET='test-only-secret';process.env.NEWSLETTER_SIGNUP_ENABLED='true';process.env.NEWSLETTER_WELCOME_EMAIL_ID='123';
 let newsletter=0,blocked=false,sendOk=true,sends=0;
 const row:Record<string,unknown>={id:'qa',state:'PROCESSING'};
 const shared=globalThis as unknown as {prisma:PrismaClient|undefined};const oldPrisma=shared.prisma;
 shared.prisma={
  $transaction:async(fn:(tx:unknown)=>unknown)=>fn({newsletterRateLimit:{deleteMany:async()=>({count:0}),upsert:async()=>({count:1})}}),
  newsletterSignup:{findUnique:async()=>null,upsert:async()=>row,update:async(args:{data:Record<string,unknown>})=>Object.assign(row,args.data),updateMany:async()=>({count:1})}
 } as unknown as PrismaClient;
 const {subscribe}=await import('./signup');
 t.mock.method(console,'error',()=>{});
 const contact=()=>({id:42,fields:{all:{email:'qa@example.invalid',nieuwsbrief:newsletter}},doNotContact:blocked?[{channel:'email'}]:[]});
 t.mock.method(global,'fetch',async(input:unknown,options?:RequestInit)=>{
  const path=new URL(String(input)).pathname;let data:unknown;
  if(path==='/oauth/v2/token')data={access_token:'test-only',expires_in:3600};
  else if(path==='/api/contacts')data={contacts:{42:contact()},total:1};
  else if(path==='/api/contacts/42')data={contact:contact()};
  else if(path==='/api/contacts/42/segments')data={lists:[]};
  else if(path==='/api/contacts/42/edit'){newsletter=JSON.parse(String(options?.body)).nieuwsbrief;data={contact:contact()};}
  else if(path==='/api/emails/123/contact/42/send'){sends++;assert.equal(newsletter,1);assert.equal(row.state,'CONFIRMED');assert.ok(!String(options?.body).includes('newsletter_confirm_url'));data={success:sendOk};}
  else throw new Error('Unexpected request '+path);
  return new Response(JSON.stringify(data),{status:200});
 });
 const input={email:'qa@example.invalid',elapsedMs:3000,source:'/vragen/',consentVersion:CONSENT_VERSION};
 try{
  assert.match(await subscribe(input,'qa'),/Bedankt/);assert.equal(newsletter,1);assert.equal(row.tokenHash,null);assert.ok(row.confirmedAt);assert.equal(sends,1);
  await subscribe(input,'qa');assert.equal(sends,1,'bestaande inschrijving ontvangt niet opnieuw mail');
  blocked=true;await assert.rejects(subscribe(input,'qa'),/uitgeschreven/);assert.equal(sends,1);
  blocked=false;newsletter=0;sendOk=false;
  assert.match(await subscribe(input,'qa'),/Bedankt/);assert.equal(row.state,'CONFIRMED');assert.equal(newsletter,1);
 }finally{
  shared.prisma=oldPrisma;
  for(const [key,value] of Object.entries({AUTH_SECRET:oldSecret,NEWSLETTER_SIGNUP_ENABLED:oldEnabled,NEWSLETTER_WELCOME_EMAIL_ID:oldTemplate}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
