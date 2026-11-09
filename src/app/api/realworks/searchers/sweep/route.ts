import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { claimSweep, ownsSweep, SWEEP_INTERVAL, SWEEP_LEASE, type SweepLease } from "@/lib/searcherSweepLease";
const KEY="realworks_searchers_sweep_43746";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, x-webhook-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
export async function OPTIONS(){return new NextResponse(null,{status:204,headers});}
export async function POST(request:NextRequest){
 if(!await isAuthorized(request))return NextResponse.json({error:"Niet geautoriseerd"},{status:401,headers});
 const b=await request.json().catch(()=>null);
 if(!b || typeof b.owner!=="string" || b.owner.length>100 || !b.owner || !["claim","heartbeat","checkpoint","complete","release"].includes(b.action))return NextResponse.json({error:"Ongeldig verzoek"},{status:400,headers});
 if(b.action==="checkpoint" && (!b.state || !Array.isArray(b.state.ids) || b.state.ids.length>20000 || !b.state.ids.every((id:unknown)=>typeof id==="string") || !Number.isInteger(b.state.index) || b.state.index<0 || b.state.index>b.state.ids.length || !["detail","results"].includes(b.state.phase) || !Number.isInteger(b.state.page) || b.state.page<1 || typeof b.state.startedAt!=="string"))return NextResponse.json({error:"Ongeldige voortgang"},{status:400,headers});
 try{
 // Upsert before the transaction ensures a lockable row on first installation.
 await prisma.appSetting.upsert({where:{key:KEY},create:{key:KEY,value:{}},update:{}});
 const result=await prisma.$transaction(async tx=>{
   // A database row lock serializes claims across processes and deployments.
   await tx.$queryRaw`SELECT id FROM app_settings WHERE \`key\`=${KEY} FOR UPDATE`;
   const row=await tx.appSetting.findUniqueOrThrow({where:{key:KEY}});
   const current=row.value as SweepLease;const now=Date.now();let next:SweepLease;
   if(b.action==="claim"){
     const claimed=claimSweep(current,b.owner,now,randomUUID());
     if(!claimed)return {granted:false,nextRunAt:current.nextRunAt,expiresAt:current.expiresAt};
     next=claimed;
   }else{
     if(typeof b.token!=="string" || !ownsSweep(current,b.owner,b.token,now))return {granted:false};
     next={...current,expiresAt:now+SWEEP_LEASE};
     if(b.action==="checkpoint")next.state=b.state;
     if(b.action==="release")next={state:current.state||null,nextRunAt:current.nextRunAt||0};
     if(b.action==="complete"){
       if(!current.state || current.state.index!==current.state.ids.length)return {granted:false};
       next={nextRunAt:now+SWEEP_INTERVAL,state:null};
     }
   }
   await tx.appSetting.update({where:{key:KEY},data:{value:JSON.parse(JSON.stringify(next))}});
   const knownIds=b.action==="claim" && !next.state ? (await tx.realworksSearcher.findMany({where:{status:{in:["LOPEND","WACHT","ACTIVE","WAITING"]}},select:{searcherId:true}})).map(s=>s.searcherId) : [];
   return {granted:true,...next,knownIds};
 });
 return NextResponse.json(result,{headers});
 }catch{return NextResponse.json({error:"Centrale planning niet beschikbaar"},{status:503,headers});}
}
