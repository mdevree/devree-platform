import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getPbxConfig } from "@/lib/pbx/store";
export async function GET(request:NextRequest) {
  if (!await isAuthorized(request)) return NextResponse.json({error:"Niet ingelogd"},{status:401});
  const [row,config,failed,pending,processor]=await Promise.all([
    prisma.appSetting.findUnique({where:{key:"pbx.reception.heartbeat"}}),getPbxConfig(),
    prisma.pbxOutbox.count({where:{status:{in:["failed","uncertain"]}}}),
    prisma.pbxOutbox.count({where:{status:"pending"}}),
    prisma.appSetting.findUnique({where:{key:"pbx.reception.processor"}}),
  ]);
  const hb=row?.value as {checkedAt?:string;appliedVersion?:number;pending?:number;audioReady?:boolean;storageReady?:boolean;asteriskReady?:boolean;testRouteOnly?:boolean}|null;
  const errors=[];
  const processed=(processor?.value as {checkedAt?:string}|null)?.checkedAt;
  if(!processed||Date.now()-Date.parse(processed)>180000)errors.push("Berichtenverwerking geeft geen recente terugmelding");
  if(!hb?.checkedAt||Date.now()-Date.parse(hb.checkedAt)>90000)errors.push("Geen recente PBX-terugmelding");
  if(hb&&(!hb.audioReady||!hb.storageReady||!hb.asteriskReady))errors.push("PBX-audio, opslag of Asterisk controleren");
  if(hb&&hb.appliedVersion!==config.version)errors.push("Instellingen nog niet toegepast op de PBX");
  if(hb?.pending)errors.push(`${hb.pending} gebeurtenissen wachten op verwerking`);
  if(failed)errors.push(`${failed} WhatsApp-berichten vragen controle`);
  if(pending)errors.push(`${pending} WhatsApp-berichten wachten op verzending`);
  return NextResponse.json({health:errors.length?"attention":"ok",configured:!!hb,checkedAt:new Date().toISOString(),target:"PBX-opvang",context:hb?.testRouteOnly!==false?"Testroute · AI-belassistent uit":"PBX-opvang · AI-belassistent uit",error:errors.join("; ")||null,heartbeat:hb,sendMode:process.env.PBX_SEND_MODE||"off"});
}
