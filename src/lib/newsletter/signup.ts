import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { newsletterMautic } from '@/lib/mautic';
import { CONSENT_VERSION, CONSENT_TEXT, hash } from './rules';

type Contact = { id:number; fields?:{all?:Record<string,unknown>}; doNotContact?:Array<{channel:string}> };
export class SignupError extends Error { constructor(message:string, public status=400){ super(message); } }
export function emailValue(value:unknown):string {
  if(typeof value!=='string') throw new SignupError('Vul een geldig e-mailadres in.');
  const email=value.trim().toLowerCase();
  if(email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new SignupError('Vul een geldig e-mailadres in.');
  return email;
}
function privateHash(value:string){const secret=process.env.NEXTAUTH_SECRET||process.env.AUTH_SECRET;if(!secret)throw new SignupError('Aanmelden is tijdelijk niet beschikbaar.',503);return createHmac('sha256',secret).update(value).digest('hex');}
async function limit(key:string,max:number,ms:number){
 await prisma.$transaction(async tx=>{
  const now=new Date();await tx.newsletterRateLimit.deleteMany({where:{key,expiresAt:{lte:now}}});
  const entry=await tx.newsletterRateLimit.upsert({where:{key},create:{key,count:1,expiresAt:new Date(now.getTime()+ms)},update:{count:{increment:1}}});
  if(entry.count>max) throw new SignupError('Probeer het later opnieuw. Er zijn te veel aanmeldpogingen.',429);
 });
}
async function getContact(id:number):Promise<Contact>{return (await newsletterMautic<{contact:Contact}>(`/api/contacts/${id}`)).contact;}
function blocked(contact:Contact){return (contact.doNotContact||[]).some(d=>d.channel==='email');}
async function excluded(contactId:number){
 // Mautic DNC is authoritative. A manually removed segment membership is also respected by the segment endpoint.
 const result=await newsletterMautic<{lists?:Array<{id:number;manuallyRemoved?:boolean}>;segments?:Array<{id:number;manuallyRemoved?:boolean}>}>(`/api/contacts/${contactId}/segments`);
 return Object.values(result.lists||result.segments||[]).some(s=>Number(s.id)===33 && s.manuallyRemoved);
}
export async function subscribe(input:Record<string,unknown>,ip:string){
 if(process.env.NEWSLETTER_SIGNUP_ENABLED!=='true')throw new SignupError('Aanmelden is binnenkort beschikbaar. Probeer het later opnieuw.',503);
 const email=emailValue(input.email);
 if(input.website || typeof input.elapsedMs!=='number' || input.elapsedMs<1500 || ![CONSENT_VERSION,'faq-newsletter-2026-09-v1'].includes(String(input.consentVersion)))throw new SignupError('Controleer de aanmelding en probeer opnieuw.');
 const source=typeof input.source==='string'&&/^\/vragen\/(?:[a-z0-9-]+\/)?$/.test(input.source)?input.source:'/vragen/';
 const emailHash=privateHash(email);
 await limit('newsletter:ip:'+privateHash(ip),5,3600000);await limit('newsletter:email:'+emailHash,1,900000);await limit('newsletter:total',100,86400000);
 const now=new Date();
 // Unique row claims each address before making external calls; simultaneous requests cannot create duplicate contacts.
 const existing=await prisma.newsletterSignup.findUnique({where:{emailHash}});
 if(existing && ['PROCESSING','CONFIRMING'].includes(existing.state) && existing.lastRequestedAt.getTime()>Date.now()-15*60000)throw new SignupError('De aanmelding wordt al verwerkt. Probeer later opnieuw.',409);
 const row=await prisma.newsletterSignup.upsert({where:{emailHash},create:{emailHash,source,consentVersion:CONSENT_VERSION,state:'PROCESSING'},update:{}});
 if(existing){const claim=await prisma.newsletterSignup.updateMany({where:{id:row.id,state:existing.state,lastRequestedAt:existing.lastRequestedAt},data:{state:'PROCESSING',lastRequestedAt:now}});if(claim.count!==1)throw new SignupError('De aanmelding wordt al verwerkt.',409);}
 try {
  let contact:Contact|undefined;
  const query=new URLSearchParams({'where[0][col]':'email','where[0][expr]':'eq','where[0][val]':email,limit:'2'});
  const found=await newsletterMautic<{contacts:Record<string,Contact>;total:number}>(`/api/contacts?${query}`);
  const matches=Object.values(found.contacts||{}).filter(c=>String(c.fields?.all?.email||'').toLowerCase()===email);
  if(matches.length>1||Number(found.total)>1)throw new SignupError('Neem contact met ons op om uw inschrijving te controleren.',409);
  contact=matches[0];
  if(!contact)contact=(await newsletterMautic<{contact:Contact}>('/api/contacts/new',{method:'POST',body:JSON.stringify({email})})).contact;
  if(!contact?.id)throw new Error('Geen contact-ID');
  contact=await getContact(contact.id);
  if(blocked(contact)||await excluded(contact.id))throw new SignupError('Uw e-mailadres is uitgeschreven of geblokkeerd. Neem contact met ons op als u zich opnieuw wilt aanmelden.',409);
  const active=contact.fields?.all?.nieuwsbrief;
  if(active===true||active===1||active==='1'){
    await prisma.newsletterSignup.update({where:{id:row.id},data:{contactId:contact.id,state:'EXISTING',tokenHash:null,expiresAt:null}});
    return 'Als uw inschrijving actief is, ontvangt u onze volgende nieuwsbrief. U hoeft niets meer te doen.';
  }
  await newsletterMautic(`/api/contacts/${contact.id}/edit`,{method:'PATCH',body:JSON.stringify({nieuwsbrief:1})});
  const verified=await getContact(contact.id);
  if(![1,'1',true].includes(verified.fields?.all?.nieuwsbrief as string|number|boolean))throw new Error('Inschrijving niet opgeslagen');
  await prisma.newsletterSignup.update({where:{id:row.id},data:{contactId:contact.id,source,consentVersion:CONSENT_VERSION,state:'CONFIRMED',confirmedAt:new Date(),tokenHash:null,expiresAt:null,lastRequestedAt:now}});
  // Signup succeeds independently of the welcome mail. Never invite duplicate retries after activation.
  try {
   const template=Number(process.env.NEWSLETTER_WELCOME_EMAIL_ID);
   if(!Number.isInteger(template)||template<=0)throw new Error('Welkomstmail ontbreekt');
   const sent=await newsletterMautic<{success?:boolean}>(`/api/emails/${template}/contact/${contact.id}/send`,{method:'POST',body:JSON.stringify({tokens:{'{newsletter_consent}':CONSENT_TEXT}})});
   if(!sent.success)throw new Error('Welkomstmail niet geaccepteerd');
  }catch { console.error('Newsletter welcome mail failed after successful signup'); }
  return 'Bedankt voor uw aanmelding. U ontvangt voortaan onze nieuwste onderwerpen. Afmelden kan via de link in elke e-mail.';
 }catch(error){
  await prisma.newsletterSignup.updateMany({where:{id:row.id,state:{in:['PROCESSING','PENDING']}},data:{state:'FAILED',tokenHash:null,expiresAt:null}});
  if(error instanceof SignupError)throw error;
  throw new SignupError('Aanmelden lukt tijdelijk niet. Probeer het later opnieuw.',503);
 }
}
export async function confirm(token:unknown){
 if(process.env.NEWSLETTER_SIGNUP_ENABLED!=='true')throw new SignupError('Bevestigen is tijdelijk niet beschikbaar.',503);
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw new SignupError('Deze bevestigingslink is ongeldig.');
 const row=await prisma.newsletterSignup.findUnique({where:{tokenHash:hash(token)}});
 if(!row||!row.contactId||!row.expiresAt||row.expiresAt<new Date())throw new SignupError('Deze link is verlopen of al gebruikt. Meld u zo nodig opnieuw aan.');
 const claim=await prisma.newsletterSignup.updateMany({where:{id:row.id,OR:[{state:'PENDING'},{state:'CONFIRMING',lastRequestedAt:{lt:new Date(Date.now()-15*60000)}}]},data:{state:'CONFIRMING',lastRequestedAt:new Date()}});
 if(claim.count!==1)throw new SignupError('Deze bevestiging is al verwerkt of wordt verwerkt.',409);
 try{
  const contact=await getContact(row.contactId);
  if(blocked(contact)||await excluded(contact.id))throw new SignupError('Uw e-mailadres is uitgeschreven of geblokkeerd. Neem contact met ons op.',409);
  await newsletterMautic(`/api/contacts/${contact.id}/edit`,{method:'PATCH',body:JSON.stringify({nieuwsbrief:1})});
  // The existing dynamic segment rule processes nieuwsbrief=1. Do not re-add manually removed members.
  const verified=await getContact(contact.id);
  if(![1,'1',true].includes(verified.fields?.all?.nieuwsbrief as string|number|boolean))throw new Error('Inschrijving niet bevestigd');
  await prisma.newsletterSignup.update({where:{id:row.id},data:{state:'CONFIRMED',confirmedAt:new Date(),tokenHash:null,expiresAt:null}});
  return 'Uw inschrijving is bevestigd. U ontvangt maximaal één keer per maand onze nieuwste onderwerpen.';
 }catch(e){await prisma.newsletterSignup.updateMany({where:{id:row.id,state:'CONFIRMING'},data:{state:'PENDING'}});if(e instanceof SignupError)throw e;throw new SignupError('Bevestigen lukt tijdelijk niet. Probeer het later opnieuw.',503);}
}
