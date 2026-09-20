import { prisma } from '@/lib/prisma';
import { newsletterMautic } from '@/lib/mautic';
import { assertRemoteDraft, safeUrl, type RemoteEmail } from './rules';
import type { Prisma } from '@prisma/client';

export async function editableIssue(id: string) {
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id } });
  if (issue.exportLockAt) throw new Error('Export wordt verwerkt of moet worden gecontroleerd.');
  if (issue.firstSentAt) throw new Error('Deze editie is al gebruikt voor verzending. Maak een nieuwe editie.');
  if (issue.mauticEmailId) {
    const data = await newsletterMautic<{email: RemoteEmail}>(`/api/emails/${issue.mauticEmailId}`);
    assertRemoteDraft(data.email, issue.exportHash);
  }
  return issue;
}
export async function mutateIssue<T>(id: string, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const issue = await editableIssue(id);
  return prisma.$transaction(async tx => {
    const claimed = await tx.newsletterIssue.updateMany({ where: { id, revision: issue.revision, exportLockAt: null, firstSentAt: null }, data: { revision: { increment: 1 }, status: 'DRAFT', approvedRevision: null, approvedAt: null, approvedBy: null } });
    if (claimed.count !== 1) throw new Error('De editie is ondertussen gewijzigd. Vernieuw de pagina.');
    return action(tx);
  });
}
export async function approveIssue(id: string, user: string) {
  const issue = await editableIssue(id);
  const blocks = await prisma.newsletterBlock.findMany({where:{issueId:id},include:{item:true}});
  if (!issue.subject.trim() || blocks.length===0) throw new Error('Vul een onderwerp en inhoud in.');
  if (blocks.some(b => b.url && !safeUrl(b.url))) throw new Error('Een link is ongeldig. Gebruik een volledige https-link.');
  if (blocks.some(b => b.item && !b.item.sourceActive)) throw new Error('Een bronartikel is niet meer gepubliceerd.');
  const result = await prisma.newsletterIssue.updateMany({where:{id,revision:issue.revision,exportLockAt:null}, data:{status:'READY',approvedRevision:issue.revision,approvedAt:new Date(),approvedBy:user}});
  if(result.count!==1) throw new Error('De editie is ondertussen gewijzigd.');
  return prisma.newsletterIssue.findUniqueOrThrow({where:{id},include:{blocks:{orderBy:{position:'asc'},include:{item:true}}}});
}

let audienceCache: {at:number;value:{members:number;eligible:number;excluded:number}} | undefined;
export async function newsletterAudience(){
 if(audienceCache && Date.now()-audienceCache.at<60000)return audienceCache.value;
 type Contact={id:number;fields?:{all?:{email?:string}};doNotContact?:{channel:string}[]};
 const contacts:Contact[]=[];
 for(let start=0;start<100000;start+=100){
  const page=await newsletterMautic<{contacts:Record<string,Contact>;total:number}>(`/api/contacts?search=segment%3Anieuwsbrief&limit=100&start=${start}`);
  const batch=Object.values(page.contacts||{});contacts.push(...batch);
  if(contacts.length>=Number(page.total)||batch.length<100)break;if(start===99900)throw new Error('Doelgroep te groot voor volledige telling.');
 }
 const emails=new Set(contacts.filter(c=>c.fields?.all?.email && !(c.doNotContact||[]).some(d=>d.channel==='email')).map(c=>c.fields!.all!.email!.toLowerCase()));
 const value={members:contacts.length,eligible:emails.size,excluded:contacts.length-emails.size};audienceCache={at:Date.now(),value};return value;
}
