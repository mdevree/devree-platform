import test from 'node:test';
import assert from 'node:assert/strict';
import {prisma} from '@/lib/prisma';
import {approveIssue,mutateIssue} from './editor';
import {exportNewsletterIssue,renderNewsletterIssue} from '@/lib/newsletter';
import {subscribe,confirm} from './signup';
import {syncFaqs,prepareMonth,syncDelivery} from './sync';
import {CONSENT_VERSION} from './rules';

const enabled=Boolean(process.env.DATABASE_URL?.includes('/devree_newsletter_qa_'));
test('nieuwsbriefketen met echte geïsoleerde MariaDB en afgeschermde externe diensten',{skip:!enabled},async t=>{
 let next=100,created=0,sendCalls=0,failCreate=false;const emails=new Map<number,Record<string,unknown>>();
 const contacts=new Map<number,{id:number;fields:{all:{email:string;nieuwsbrief:number}};doNotContact:{channel:string}[]}>();let link='';let faqAnswer='Gepubliceerd kort antwoord';
 const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
 const realFetch=global.fetch;
 global.fetch=async(input,options)=>{
  const url=new URL(String(input));const path=url.pathname;const body=options?.body&&path!=='/oauth/v2/token'?JSON.parse(String(options.body)):{};
  if(path==='/oauth/v2/token')return response({access_token:'QA_ONLY',expires_in:3600});
  if(url.hostname==='www.devreemakelaardij.nl')return response([{id:12761,date_gmt:'2026-09-01T12:00:00',modified_gmt:'2026-09-20T12:00:00',link:'https://www.devreemakelaardij.nl/vragen/bedenktijd/',title:{rendered:'Bedenktijd'},newsletter:{answer:faqAnswer,topics:['kopers'],thumbnail:null,hasVideo:true}}]);
  if(path==='/api/emails' && (!options?.method||options.method==='GET'))return response({emails:Object.fromEntries([...emails].filter(([,e])=>String(e.name).includes(url.searchParams.get('search')||'')))});
  if(path==='/api/emails/new'){const id=next++;created++;emails.set(id,{...body,id,sentCount:0});if(failCreate){failCreate=false;throw new Error('Simulated lost response');}return response({email:emails.get(id)});}
  const emailMatch=path.match(/^\/api\/emails\/(\d+)(\/edit)?$/);if(emailMatch){const id=Number(emailMatch[1]);if(emailMatch[2])emails.set(id,{...emails.get(id),...body});return response({email:emails.get(id)});}
  if(path==='/api/contacts'){const email=url.searchParams.get('where[0][val]');const values=[...contacts.values()].filter(c=>c.fields.all.email===email);return response({contacts:Object.fromEntries(values.map(c=>[c.id,c])),total:values.length});}
  if(path==='/api/contacts/new'){const id=next++;const c={id,fields:{all:{email:body.email,nieuwsbrief:0}},doNotContact:[]};contacts.set(id,c);return response({contact:c});}
  const contactMatch=path.match(/^\/api\/contacts\/(\d+)(\/edit|\/segments)?$/);if(contactMatch){const c=contacts.get(Number(contactMatch[1]))!;if(contactMatch[2]==='/segments')return response({lists:[]});if(contactMatch[2]==='/edit')c.fields.all.nieuwsbrief=body.nieuwsbrief;return response({contact:c});}
  if(path.match(/^\/api\/emails\/123\/contact\/\d+\/send$/)){sendCalls++;link=body.tokens['{newsletter_confirm_url}'];return response({success:true});}
  throw new Error('Unexpected external request: '+path);
 };
 try{
  await prisma.newsletterBlock.deleteMany();await prisma.newsletterIssue.deleteMany();await prisma.newsletterItem.deleteMany();await prisma.newsletterSignup.deleteMany();await prisma.newsletterRateLimit.deleteMany();
  const issue=await prisma.newsletterIssue.create({data:{name:'QA',subject:'QA subject',segmentIds:[33],blocks:{create:{type:'TEXT',position:0,title:'Keuring',body:'Uitleg',url:'https://www.devreemakelaardij.nl/vragen/keuring/'}}}});
  await t.test('alleen goedgekeurde actuele versies exporteren',async()=>{
   await assert.rejects(exportNewsletterIssue(issue.id),/goed/);await approveIssue(issue.id,'qa@example.invalid');
   await mutateIssue(issue.id,tx=>tx.newsletterIssue.update({where:{id:issue.id},data:{subject:'Gewijzigd'}}));await assert.rejects(exportNewsletterIssue(issue.id),/goed/);
   await approveIssue(issue.id,'qa@example.invalid');const first=await exportNewsletterIssue(issue.id);const second=await exportNewsletterIssue(issue.id);assert.equal(first.mauticEmailId,second.mauticEmailId);assert.equal(created,1);assert.equal(sendCalls,0);assert.equal(emails.get(first.mauticEmailId)?.isPublished,false);
   const stored=await prisma.newsletterIssue.findUniqueOrThrow({where:{id:issue.id}});assert.equal(stored.status,'EXPORTED');assert.equal(stored.firstSentAt,null);
   const e=emails.get(first.mauticEmailId)!;const original=e.customHtml;e.customHtml='Extern gewijzigd';await assert.rejects(exportNewsletterIssue(issue.id),/buiten/);e.customHtml=original;
   e.isPublished=true;await assert.rejects(mutateIssue(issue.id,async()=>true),/geactiveerd/);e.isPublished=false;
  });
  await t.test('verloren create-response herstelt bestaand concept',async()=>{
   const i=await prisma.newsletterIssue.create({data:{name:'QA recover',subject:'Recover',segmentIds:[33],blocks:{create:{position:0,type:'TEXT',title:'QA',body:'QA'}}}});await approveIssue(i.id,'qa@example.invalid');failCreate=true;await assert.rejects(exportNewsletterIssue(i.id));const before=created;await exportNewsletterIssue(i.id);assert.equal(created,before);
  });
  await t.test('gelijktijdig exporteren maakt maximaal één concept',async()=>{
   const i=await prisma.newsletterIssue.create({data:{name:'QA concurrent',subject:'Concurrent',segmentIds:[33],blocks:{create:{position:0,type:'TEXT',title:'QA'}}}});await approveIssue(i.id,'qa@example.invalid');const before=created;const results=await Promise.allSettled([exportNewsletterIssue(i.id),exportNewsletterIssue(i.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(created,before+1);
  });
  await t.test('FAQ-import behoudt redactie en maandconcept is uniek',async()=>{
   await syncFaqs();const item=await prisma.newsletterItem.findUniqueOrThrow({where:{sourceKey:'wordpress:faq:12761'}});await prisma.newsletterItem.update({where:{id:item.id},data:{description:'Eigen redactionele tekst'}});faqAnswer='Nieuw bronantwoord';await syncFaqs();const saved=await prisma.newsletterItem.findUniqueOrThrow({where:{id:item.id}});assert.equal(saved.description,'Eigen redactionele tekst');assert.equal((saved.sourceData as {answer:string}).answer,'Nieuw bronantwoord');
   const now=new Date('2026-09-20T12:00:00Z');const a=await prepareMonth(now),b=await prepareMonth(now);assert.equal(a.id,b.id);assert.equal((await prisma.newsletterIssue.findMany({where:{monthKey:'faq-2026-09'}})).length,1);assert.equal((await prisma.newsletterItem.findUniqueOrThrow({where:{id:item.id}})).status,'GEPLAND');
  });
  await t.test('nieuwe inschrijving activeert uitsluitend na expliciete bevestiging',async()=>{
   const message=await subscribe({email:'newsletter-qa@example.invalid',source:'/vragen/',elapsedMs:3000,consentVersion:CONSENT_VERSION},'qa-ip-1');assert.match(message,/mailbox/);const row=await prisma.newsletterSignup.findFirstOrThrow();const c=contacts.get(row.contactId!)!;assert.equal(c.fields.all.nieuwsbrief,0);const token=link.split('#')[1];assert.ok(token);assert.notEqual(row.tokenHash,token);
   const results=await Promise.allSettled([confirm(token),confirm(token)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(c.fields.all.nieuwsbrief,1);assert.equal((await prisma.newsletterSignup.findUniqueOrThrow({where:{id:row.id}})).tokenHash,null);await assert.rejects(confirm(token));
   await assert.rejects(subscribe({email:'newsletter-qa@example.invalid',source:'/vragen/',elapsedMs:3000,consentVersion:CONSENT_VERSION},'qa-ip-1'),/veel/);
  });
  await t.test('afmeldingen en verlopen links worden niet geactiveerd',async()=>{
   contacts.set(999,{id:999,fields:{all:{email:'blocked@example.invalid',nieuwsbrief:0}},doNotContact:[{channel:'email'}]});const before=sendCalls;await assert.rejects(subscribe({email:'blocked@example.invalid',elapsedMs:3000,consentVersion:CONSENT_VERSION},'qa-ip-2'),/uitgeschreven/);assert.equal(sendCalls,before);
   await subscribe({email:'expired@example.invalid',elapsedMs:3000,consentVersion:CONSENT_VERSION},'qa-ip-3');const token=link.split('#')[1];await prisma.newsletterSignup.updateMany({where:{state:'PENDING'},data:{expiresAt:new Date(0)}});await assert.rejects(confirm(token),/verlopen/);
  });
  await t.test('verzendstatus volgt Mautic, niet export',async()=>{
   const stored=await prisma.newsletterIssue.findUniqueOrThrow({where:{id:issue.id}});emails.get(stored.mauticEmailId!)!.sentCount=2;await syncDelivery();const checked=await prisma.newsletterIssue.findUniqueOrThrow({where:{id:issue.id}});assert.equal(checked.sentCount,2);assert.ok(checked.firstSentAt);
   const rendered=renderNewsletterIssue({...issue,blocks:[]});assert.match(rendered.html,/{unsubscribe_url}/);assert.match(rendered.plainText,/{unsubscribe_url}/);
  });
 }finally{global.fetch=realFetch;await prisma.$disconnect();}
});
