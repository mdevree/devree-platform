import {NextRequest,NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {socialInclude} from '@/lib/social/store';
import {CHANNELS,KINDS,text,url,date} from '@/lib/social/rules';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context) {
 if(!await auth()) return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {id}=await params;
 const project=await prisma.project.findUnique({where:{id},select:{id:true,name:true, woningAdres:true, woningPlaats:true}});
 if(!project)return NextResponse.json({error:'Project niet gevonden'},{status:404});
 const [posts,unmatched,projects,health]=await Promise.all([
 prisma.socialPublication.findMany({where:{links:{some:{projectId:id}}},include:socialInclude,orderBy:{scheduledAt:'desc'}}),
 prisma.socialPublication.findMany({where:{excluded:false,links:{none:{}}},include:socialInclude,orderBy:{scheduledAt:'desc'}}),
 prisma.project.findMany({select:{id:true,name:true},orderBy:{name:'asc'}}),prisma.appSetting.findUnique({where:{key:'social_sync'}})]);
 return NextResponse.json({project,posts,unmatched,projects,health:health?.value||null});
}
export async function POST(req:NextRequest,{params}:Context) {
 const session=await auth();if(!session)return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {id}=await params;
 if(!await prisma.project.findUnique({where:{id},select:{id:true}}))return NextResponse.json({error:'Project niet gevonden'},{status:404});
 try {
 const raw=await req.text();if(raw.length>25000)throw Error('Te veel tekst');const v=JSON.parse(raw);
 const channel=text(v.channel,40),kind=text(v.kind,30),content=text(v.content),releaseUrl=url(v.releaseUrl),publishedAt=date(v.publishedAt);
 if(!CHANNELS.includes(channel as typeof CHANNELS[number])||!KINDS.includes(kind as typeof KINDS[number])||!content||!publishedAt||publishedAt>new Date())throw Error('Vul kanaal, type, tekst en een publicatiedatum in het verleden in');
 const post=await prisma.$transaction(async tx=>{
 const existing=releaseUrl?await tx.socialPublication.findFirst({where:{releaseUrl}}):null;
 const p=existing||await tx.socialPublication.create({data:{aliases:[],source:'manual',channel,account:text(v.account||'De Vree Makelaardij',200),kind,content,state:'MANUAL',publishedAt,scheduledAt:publishedAt,dateBasis:'Handmatig opgegeven publicatietijd',releaseUrl,confirmed:!!releaseUrl,everPublished:!!releaseUrl,mappingLocked:true}});
 await tx.socialProjectLink.upsert({where:{publicationId_projectId:{publicationId:p.id,projectId:id}},create:{publicationId:p.id,projectId:id},update:{}});
 await tx.socialPublication.update({where:{id:p.id},data:{mappingLocked:true}});
 await tx.socialPublicationEvent.create({data:{publicationId:p.id,actor:session.user?.email||'Medewerker',detail:{action:existing?'Bestaande plaatsing gekoppeld':'Handmatig toegevoegd',projectId:id}}});return p;
 });return NextResponse.json({id:post.id});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Opslaan mislukt'},{status:400});}
}
export async function PATCH(req:NextRequest,{params}:Context) {
 const session=await auth();if(!session)return NextResponse.json({error:'Niet ingelogd'},{status:401});
 const {id}=await params;
 try {
 const v=await req.json();const publicationId=text(v.publicationId,100);
 if(!Array.isArray(v.projectIds)||v.projectIds.length>20||v.projectIds.some((x:unknown)=>typeof x!=='string'))throw Error('Ongeldige projectselectie');
 const ids=[...new Set(v.projectIds as string[])];
 if(await prisma.project.count({where:{id:{in:ids}}})!==ids.length)throw Error('Project niet gevonden');
 if(!await prisma.project.findUnique({where:{id},select:{id:true}}))throw Error('Project niet gevonden');
 await prisma.$transaction(async tx=>{
 const old=await tx.socialPublication.findUniqueOrThrow({where:{id:publicationId},include:{links:true}});
 await tx.socialProjectLink.deleteMany({where:{publicationId}});
 if(ids.length)await tx.socialProjectLink.createMany({data:ids.map(projectId=>({publicationId,projectId}))});
 await tx.socialPublication.update({where:{id:publicationId},data:{mappingLocked:true,excluded:v.excluded===true, ...(typeof v.removed==='boolean'?{removed:v.removed}:{})}});
 await tx.socialPublicationEvent.create({data:{publicationId,actor:session.user?.email||'Medewerker',detail:{action:'Koppeling aangepast',previous:old.links.map(l=>l.projectId),projects:ids,excluded:v.excluded===true}}});
 });return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Koppeling opslaan mislukt'},{status:400});}
}
