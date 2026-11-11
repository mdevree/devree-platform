import {NextRequest,NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {getContactFull,getMauticNotesPage} from '@/lib/mautic';
export async function GET(req:NextRequest){
 if(!await auth())return NextResponse.json({error:'Log in op het platform'},{status:401});
 const id=Number(req.nextUrl.searchParams.get('id')),start=Number(req.nextUrl.searchParams.get('start')||0);
 if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(start)||start<0)return NextResponse.json({error:'Ongeldig contact'},{status:400});
 try{
 const [contact,linked,primary,notes]=await Promise.all([getContactFull(id,AbortSignal.timeout(15000)),prisma.projectContact.findMany({where:{mauticContactId:id},select:{role:true,project:{select:{id:true,name:true,status:true}}}}),prisma.project.findMany({where:{mauticContactId:id},select:{id:true,name:true,status:true}}),getMauticNotesPage(id,start).catch(()=>null)]);
 if(!contact)return NextResponse.json({error:'Contact niet gevonden'},{status:404});
 const linkedIds=new Set(linked.map(p=>p.project.id));
 const projects=[...linked,...primary.filter(p=>!linkedIds.has(p.id)).map(project=>({project,role:'Hoofdcontact'}))];
 return NextResponse.json({contact,projects,notes,notesUnavailable:notes===null},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Klantkaart tijdelijk niet beschikbaar'},{status:503});}
}
