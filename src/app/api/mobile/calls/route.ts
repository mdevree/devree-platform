import {NextRequest,NextResponse} from 'next/server';
import {auth} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {withProfileLock} from '@/lib/contactProfileLock';
import {getContactFull,findMobileMauticNote,createMobileMauticNote,verifyMobileMauticNote} from '@/lib/mautic';
import {validateMobileCall,mobileCallHash,mobileNoteMarker,mobileNoteText,deliverMobileNote} from '@/lib/mobileCalls';
type DeliveryState={hash:string;userId:string;callId:string;noteId:string;mauticNoteId?:number;attemptedAt?:number};
export async function POST(req:NextRequest){
 const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Log in op het platform'},{status:401});
 const origin=req.headers.get('origin');const allowedOrigin=new URL(process.env.NEXTAUTH_URL||req.url).origin;if(origin&&origin!==allowedOrigin)return NextResponse.json({error:'Ongeldige herkomst'},{status:403});
 let input;try{input=validateMobileCall(await req.json());}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
 const v=input,hash=mobileCallHash(v),key='mobile_call:'+v.requestId,author=session.user.name||session.user.email||'Medewerker';
 try{return await withProfileLock(key,async()=>{
  let row=await prisma.appSetting.findUnique({where:{key}});
  let state=row?.value as DeliveryState|undefined;
  if(state&&(state.hash!==hash||state.userId!==session.user.id))return NextResponse.json({error:'Dit gesprek is al opgeslagen met andere gegevens. Bekijk de bestaande notitie in het platform.'},{status:409});
  if(!state){
   const contact=await getContactFull(v.contactId,AbortSignal.timeout(15000));if(!contact)return NextResponse.json({error:'Contact kon niet worden gecontroleerd; probeer opnieuw'},{status:503});
   const name=[contact.firstname,contact.lastname].filter(Boolean).join(' ');
   // One atomic platform record, note and delivery receipt. Never use the general note webhook here.
   row=await prisma.$transaction(async tx=>{
    const call=await tx.call.create({data:{callId:'mobile:'+v.requestId,timestamp:new Date(v.startedAt),status:'ended',reason:'completed',direction:v.direction,callerNumber:'',destinationNumber:'',destinationUser:author,mauticContactId:v.contactId,contactName:name,notes:{create:{note:v.note,createdBy:author}}},include:{notes:true}});
    return tx.appSetting.create({data:{key,value:{hash,userId:session.user.id,callId:call.id,noteId:call.notes[0].id,input:v,author}}});
   });state=row.value as unknown as DeliveryState;
  }
  if(!state)throw Error('Missing receipt');
  if(!state.mauticNoteId){
   const savedState=state;
   try{
    const id=await deliverMobileNote({find:()=>findMobileMauticNote(v.contactId,mobileNoteMarker(v.requestId)),create:()=>createMobileMauticNote(v.contactId,mobileNoteText(v,author),v.startedAt),verify:id=>verifyMobileMauticNote(id,v.contactId,mobileNoteMarker(v.requestId),mobileNoteText(v,author)),beforeCreate:async()=>{savedState.attemptedAt=Date.now();await prisma.appSetting.update({where:{key},data:{value:JSON.parse(JSON.stringify({...row!.value as object,...savedState}))}});}},state.attemptedAt);
    state.mauticNoteId=id;await prisma.appSetting.update({where:{key},data:{value:JSON.parse(JSON.stringify({...row!.value as object,...state}))}});
   }catch{return NextResponse.json({platformStored:true,mauticStored:false,callId:state.callId,message:'Opgeslagen in het platform. Mautic is nog niet bevestigd. Probeer over een minuut opnieuw.'},{status:202});}
  }
  return NextResponse.json({platformStored:true,mauticStored:true,callId:state.callId,mauticNoteId:state.mauticNoteId,requestId:v.requestId});
 });}catch{return NextResponse.json({error:'Opslaan niet bevestigd. Je notitie blijft bewaard; probeer opnieuw.'},{status:503});}
}
