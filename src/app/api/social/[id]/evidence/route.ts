import {NextRequest,NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context) {
 if(!await auth())return new NextResponse(null,{status:401});const {id}=await params;
 const e=await prisma.socialEvidence.findUnique({where:{publicationId:id}});if(!e)return new NextResponse(null,{status:404});
 return new NextResponse(e.data,{headers:{'Content-Type':e.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function POST(req:NextRequest,{params}:Context) {
 const session=await auth();if(!session)return new NextResponse(null,{status:401});const {id}=await params;
 if(Number(req.headers.get('content-length'))>5500000)return NextResponse.json({error:'Maximaal 5 MB'},{status:413});
 try {
 const form=await req.formData(), file=form.get('file');if(!(file instanceof File)||file.size>5000000)throw Error();
 const bytes=Buffer.from(await file.arrayBuffer());
 const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mime) return NextResponse.json({error:'Gebruik een PNG- of JPG-afbeelding van maximaal 5 MB'},{status:400});
 await prisma.$transaction(async tx=>{
 const p=await tx.socialPublication.findUniqueOrThrow({where:{id}});
 await tx.socialEvidence.upsert({where:{publicationId:id},create:{publicationId:id,mime,data:bytes},update:{mime,data:bytes}});
 if(p.source==='manual')await tx.socialPublication.update({where:{id},data:{confirmed:true,everPublished:true}});
 await tx.socialPublicationEvent.create({data:{publicationId:id,actor:session.user?.email||'Medewerker',detail:{action:'Bewijsafbeelding toegevoegd'}}});
 });return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Bewijs opslaan mislukt'},{status:400});}
}
