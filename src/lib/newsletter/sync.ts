import { prisma } from '@/lib/prisma';
import { newsletterMautic } from '@/lib/mautic';
import { normalizeKeyword, reportPeriods, amsterdamDate, NEWSLETTER_SEGMENT_ID, safeUrl, type RemoteEmail } from './rules';
import type { Prisma } from '@prisma/client';

type Faq = {id:number;date_gmt:string;modified_gmt:string;link:string;title:{rendered:string};newsletter:{answer:string;topics:string[];thumbnail:string|null;hasVideo:boolean}|null};
function plain(value:string){return value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#8217;/g,"'").replace(/&#8211;/g,'–').replace(/&#038;/g,'&').replace(/&quot;/g,'"').trim();}
export async function syncFaqs(){
 const faqs:Faq[]=[];
 for(let page=1;page<=100;page++){
  const r=await fetch(`https://www.devreemakelaardij.nl/wp-json/wp/v2/faq?per_page=100&page=${page}&_fields=id,date_gmt,modified_gmt,link,title,newsletter`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`WordPress niet beschikbaar (${r.status})`);
  const rows=await r.json() as Faq[];
  if(!Array.isArray(rows)||rows.some(row=>!row.newsletter||typeof row.newsletter.answer!=='string'))throw new Error('WordPress mist de nieuwsbriefvelden. Activeer eerst de FAQ-uitbreiding.');
  faqs.push(...rows);const pages=Number(r.headers.get('x-wp-totalpages')||1);if(page>=pages)break;if(page===100)throw new Error('Te veel FAQ-pagina’s; synchronisatie afgebroken.');
 }
 const keys=faqs.map(f=>`wordpress:faq:${f.id}`);
 await prisma.$transaction(async tx=>{
  for(const faq of faqs){
   const url=safeUrl(faq.link);if(!url||new URL(url).hostname!=='www.devreemakelaardij.nl')throw new Error('Ongeldige FAQ-bron');
   const sourceData={...faq.newsletter,title:plain(faq.title.rendered),url,publishedAt:faq.date_gmt,modifiedAt:faq.modified_gmt,wordpressId:faq.id,syncedAt:new Date().toISOString()};
   await tx.newsletterItem.upsert({where:{sourceKey:`wordpress:faq:${faq.id}`},create:{sourceKey:`wordpress:faq:${faq.id}`,title:sourceData.title,url,description:faq.newsletter!.answer,category:'FAQ',sourceHost:'devreemakelaardij.nl',sourceTitle:'WordPress FAQ',sourceData,sourceActive:true},update:{sourceData,sourceActive:true}});
  }
  await tx.newsletterItem.updateMany({where:{sourceKey:{startsWith:'wordpress:faq:',notIn:keys}},data:{sourceActive:false}});
 },{timeout:30000});
 return {count:faqs.length};
}
import { aggregate, noResultKeywords, type SearchRow } from './searchMetrics';
export { aggregate } from './searchMetrics';
async function matomo(method:string,date:string,events=false):Promise<SearchRow[]>{
 const token=process.env.MATOMO_API_TOKEN;if(!token)throw new Error('Matomo-koppeling nog niet ingesteld.');
 const body=new URLSearchParams({module:'API',method,idSite:'1',period:'range',date,format:'JSON',filter_limit:'-1',token_auth:token,...(events?{expanded:'1',secondaryDimension:'eventName'}:{segment:'siteSearchCategory=@FAQ /'})});
 const r=await fetch('https://stats.devreemakelaardij.nl/index.php',{method:'POST',body,cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Matomo niet beschikbaar (${r.status})`);
 const data=await r.json();if(!Array.isArray(data))throw new Error('Matomo kon de FAQ-zoekrapportage niet leveren.');return data;
}
export async function syncInsights(){
 const periods=reportPeriods();
 const [a,b,c]=await Promise.all([matomo('Actions.getSiteSearchKeywords',periods.current),matomo('Events.getCategory',periods.current,true),matomo('Actions.getSiteSearchKeywords',periods.previous)]);
 const current=aggregate(a),zero=noResultKeywords(b),previous=aggregate(c);
 await prisma.$transaction(async tx=>{
  await tx.newsletterInsight.updateMany({data:{searches:0,noResults:0,previousSearches:0}});
  for(const keyword of new Set([...current.keys(),...zero.keys(),...previous.keys()])){
   const data={searches:current.get(keyword)||0,noResults:zero.get(keyword)||0,previousSearches:previous.get(keyword)||0};
   await tx.newsletterInsight.upsert({where:{keyword},create:{keyword,...data},update:data});
  }
 },{timeout:30000});return periods;
}
export async function syncDelivery(){
 const issues=await prisma.newsletterIssue.findMany({where:{mauticEmailId:{not:null}}});
 for(const issue of issues){
  const email=(await newsletterMautic<{email:RemoteEmail}>(`/api/emails/${issue.mauticEmailId}`)).email;
  const sentCount=Number(email.sentCount||0);
  if(sentCount>0)await prisma.$transaction([
   prisma.newsletterIssue.update({where:{id:issue.id},data:{sentCount,firstSentAt:issue.firstSentAt||new Date()}}),
   prisma.newsletterItem.updateMany({where:{blocks:{some:{issueId:issue.id}}},data:{status:'GEBRUIKT'}})
  ]);
 }
 return {checked:issues.length};
}
export async function prepareMonth(now=new Date(),first=false){
 const monthKey='faq-'+amsterdamDate(now).slice(0,7);
 const existing=await prisma.newsletterIssue.findUnique({where:{monthKey}});if(existing)return {id:existing.id,created:false};
 const candidates=await prisma.newsletterItem.findMany({where:{sourceKey:{startsWith:'wordpress:faq:'},sourceActive:true,status:'INBOX',blocks:{none:{}}}});
 const signals=await prisma.newsletterInsight.findMany({where:{searches:{gt:0},state:{not:'IGNORED'}}});
 const isFirst=first && (await prisma.newsletterIssue.count())===0;
 const preferred=[12761,12860,12905];
 const score=(item:typeof candidates[number])=>{const source=item.sourceData as Record<string,unknown>|null;const text=normalizeKeyword(item.title+' '+item.description);return (isFirst&&preferred.includes(Number(source?.wordpressId))?100000-preferred.indexOf(Number(source?.wordpressId)):0)+signals.reduce((sum,s)=>sum+(s.keyword.split(' ').every(w=>text.includes(w))?s.searches:0),0);};
 candidates.sort((a,b)=>score(b)-score(a)||String((b.sourceData as Record<string,unknown>)?.publishedAt||'').localeCompare(String((a.sourceData as Record<string,unknown>)?.publishedAt||'')));
 const selected=candidates.slice(0,3);if(!selected.length)return {created:false,message:'Geen nieuwe onderwerpen'};
 const label=new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric',timeZone:'Europe/Amsterdam'}).format(now);
 try{return await prisma.$transaction(async tx=>{
  const issue=await tx.newsletterIssue.create({data:{monthKey,name:`Vragen en antwoorden – ${label}`,subject:'Antwoorden op uw vragen over wonen',preheader:selected.map(i=>i.title).join(' · ').slice(0,150),segmentIds:[NEWSLETTER_SEGMENT_ID],createdBy:'newsletter-preparation'}});
  await tx.newsletterBlock.create({data:{issueId:issue.id,type:'HERO',position:0,title:'Nieuwe antwoorden in uw mailbox',body:isFirst?'Een selectie van onze uitleg over kopen, verkopen en taxaties.':'Deze maand zetten we een aantal onderwerpen voor u op een rij.'}});
  for(const [i,item] of selected.entries()){
   const claim=await tx.newsletterItem.updateMany({where:{id:item.id,status:'INBOX',blocks:{none:{}}},data:{status:'GEPLAND'}});if(claim.count!==1)throw new Error('Onderwerp wordt al gebruikt. Probeer opnieuw.');
   await tx.newsletterBlock.create({data:{issueId:issue.id,itemId:item.id,type:'TEXT',position:i+1,title:item.title,body:(item.description||'').split(/\s+/).slice(0,55).join(' '),url:item.url,ctaLabel:'Lees het antwoord'}});
  }
  await tx.newsletterBlock.create({data:{issueId:issue.id,type:'CTA',position:4,title:'Meer vragen?',body:'Bekijk alle antwoorden en video’s op onze website.',url:'https://www.devreemakelaardij.nl/vragen/',ctaLabel:'Bekijk alle vragen'}});
  return {id:issue.id,created:true};
 });}catch(e){const recovered=await prisma.newsletterIssue.findUnique({where:{monthKey}});if(recovered)return {id:recovered.id,created:false};throw e;}
}
export async function runNewsletterSync(month=false,first=false){
 const result:Record<string,unknown>={};
 const tasks:[string,()=>Promise<unknown>][]=[['faq',syncFaqs],['matomo',syncInsights],['delivery',syncDelivery]];
 if(month)tasks.push(['month',()=>prepareMonth(new Date(),first)]);
 for(const [key,task] of tasks){
  await prisma.newsletterSync.upsert({where:{key},create:{key},update:{}});
  const lock=new Date();const claim=await prisma.newsletterSync.updateMany({where:{key,OR:[{lockedAt:null},{lockedAt:{lt:new Date(Date.now()-3600000)}}]},data:{lockedAt:lock,lastAttemptAt:lock}});
  if(!claim.count){result[key]={busy:true};continue;}
  try{if(key==='month' && !(result.faq as {ok?:boolean})?.ok)throw new Error('Maandconcept wacht op succesvolle FAQ-synchronisatie.');const data=await task();await prisma.newsletterSync.update({where:{key},data:{lastSuccessAt:new Date(),error:null,data:data as Prisma.InputJsonValue}});result[key]={ok:true,data};}
  catch(e){const message=e instanceof Error?e.message:'Synchronisatie mislukt';await prisma.newsletterSync.update({where:{key},data:{error:message}});result[key]={ok:false,error:message};}
  finally{await prisma.newsletterSync.updateMany({where:{key,lockedAt:lock},data:{lockedAt:null}});}
 }
 await prisma.newsletterRateLimit.deleteMany({where:{expiresAt:{lt:new Date()}}});
 return result;
}
