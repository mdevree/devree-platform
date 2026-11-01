import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { matchProjects, publicationKey, findExternalMatch, type ImportRow } from './rules';

export async function ingest(rows: ImportRow[], capturedAt: Date, complete: boolean, since: string | null) {
  const projects=await prisma.project.findMany({select:{id:true,realworksId:true, woningAdres:true,address:true}});
  for(const row of rows) await prisma.$transaction(async tx=>{
    const existing=await tx.socialPublication.findMany({select:{id:true,aliases:true,externalKey:true,releaseUrl:true,lastSeenAt:true,source:true}});
    const identity=publicationKey(row.channel,row.accountId,row.releaseId,row.releaseUrl);
    const key=identity?createHash("sha256").update(identity).digest("hex"):null;
    const alias=existing.find(p=>Array.isArray(p.aliases)&&p.aliases.includes(row.sourceId));
    const external=findExternalMatch(existing,key,row.releaseUrl);
    let id=alias?.id || external?.id;
    if(alias && external && alias.id!==external.id) {
      // Merge a hand-entered URL with the eventual Postiz record, retaining evidence and links.
      const other=await tx.socialPublication.findUniqueOrThrow({where:{id:external.id},include:{links:true,evidence:true}});
      const keep=await tx.socialPublication.findUniqueOrThrow({where:{id:alias.id},include:{evidence:true}});
      for(const l of other.links) await tx.socialProjectLink.upsert({where:{publicationId_projectId:{publicationId:keep.id,projectId:l.projectId}},create:{publicationId:keep.id,projectId:l.projectId},update:{}});
      if(other.evidence && !keep.evidence) await tx.socialEvidence.update({where:{publicationId:other.id},data:{publicationId:keep.id}});
      await tx.socialPublicationEvent.updateMany({where:{publicationId:other.id},data:{publicationId:keep.id}});
      await tx.socialPublication.delete({where:{id:other.id}});
      await tx.socialPublication.update({where:{id:keep.id},data:{mappingLocked:keep.mappingLocked||other.mappingLocked,everPublished:keep.everPublished||other.everPublished,aliases:[...new Set([...(keep.aliases as string[]),...(other.aliases as string[])])]}});
      id=keep.id;
    }
    if(alias && key && alias.externalKey && alias.externalKey!==key && row.state==='PUBLISHED') {
      const prior=await tx.socialPublication.findUniqueOrThrow({where:{id:alias.id}});
      if(prior.everPublished && prior.releaseId && row.releaseId && prior.releaseId!==row.releaseId) {
        await tx.socialPublication.update({where:{id:alias.id},data:{aliases:(prior.aliases as string[]).map(a=>a===row.sourceId?`${a}@${prior.externalKey}`:a)}});
        id=external?.id!==alias.id?external?.id:undefined;
      }
    }
    const old=id?await tx.socialPublication.findUnique({where:{id},include:{links:true}}):null;
    if(old && old.lastSeenAt>capturedAt) return;
    const confirmed=row.state==='PUBLISHED' && !!(row.releaseId||row.releaseUrl);
    const data={source:'postiz',aliases:[...new Set([...(old?.aliases as string[]||[]),row.sourceId])],externalKey:key,channel:row.channel,account:row.account,kind:row.kind==='unknown'&&old?old.kind:row.kind,content:row.content,state:row.state,scheduledAt:row.scheduledAt,publishedAt:row.publishedAt||old?.publishedAt,dateBasis:row.publishedAt?'Werkelijke publicatietijd':'Postiz-plandatum; exacte livegang onbekend',releaseId:row.releaseId||old?.releaseId,releaseUrl:row.releaseUrl||old?.releaseUrl,mediaUrl:row.mediaUrl||old?.mediaUrl,sourceUrl:row.sourceUrl||old?.sourceUrl,confirmed,everPublished:!!old?.everPublished||confirmed,sourceRemoved:row.removed,removed:!!old?.removed,lastSeenAt:capturedAt};
    const saved=old?await tx.socialPublication.update({where:{id:old.id},data}):await tx.socialPublication.create({data});
    const matches=matchProjects(row,projects);
    if(!saved.mappingLocked && !saved.excluded && matches.length) await tx.socialProjectLink.deleteMany({where:{publicationId:saved.id,projectId:{notIn:matches}}});
    if(!saved.mappingLocked && !saved.excluded) for(const projectId of matches) await tx.socialProjectLink.upsert({where:{publicationId_projectId:{publicationId:saved.id,projectId}},create:{publicationId:saved.id,projectId},update:{}});
    if(!old || old.state!==saved.state || old.sourceRemoved!==saved.sourceRemoved || matches.some(x=>!old.links.some(l=>l.projectId===x))) await tx.socialPublicationEvent.create({data:{publicationId:saved.id,actor:'Postiz synchronisatie',detail:{state:saved.state,sourceRemoved:saved.sourceRemoved,matched:matches}}});
  },{timeout:15000});
  if(complete) await prisma.appSetting.upsert({where:{key:'social_sync'},create:{key:'social_sync',value:{lastSuccessAt:capturedAt.toISOString(),since}},update:{value:{lastSuccessAt:capturedAt.toISOString(),since}}});
}

export const socialInclude = {links:{select:{projectId:true}},evidence:{select:{mime:true}},events:{orderBy:{createdAt:'desc' as const},take:10}} satisfies Prisma.SocialPublicationInclude;
