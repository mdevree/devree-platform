import { NextRequest,NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
export async function GET(r:NextRequest) {
  if(!await isAuthorized(r)) return NextResponse.json({error:"Niet ingelogd"},{status:401});
  const setting=await prisma.appSetting.findUnique({where:{key:"energy_label_monitor"}});
  const h=setting?.value as Record<string,unknown>|null;
  const stale=!h?.lastSuccessAt || Date.now()-new Date(String(h.lastSuccessAt)).getTime()>48*3600000 || !h?.throughDate || Date.now()-new Date(String(h.throughDate)).getTime()>72*3600000;
  return NextResponse.json({...h,status:stale?"attention":h?.status||"not_configured"});
}
