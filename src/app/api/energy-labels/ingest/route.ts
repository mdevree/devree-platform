import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { labelAddressKey, DAY } from "@/lib/energyLabelRules";
import { reconcileEnergyLabels } from "@/lib/energyLabels";

export const maxDuration = 120;

function secretMatches(actual: string | null, expected: string | undefined) {
  return !!actual && !!expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}
function string(r: Record<string,unknown>, key:string, required=false) {
  const v = r[key];
  if (v === null || v === undefined || v === "") { if(required) throw new Error(key); return null; }
  if(typeof v !== "string" || v.length>191) throw new Error(key);
  return v;
}
function date(r:Record<string,unknown>,key:string,required=true) {
  const v=string(r,key,required); if(!v) return null;
  const d=new Date(v); if(!Number.isFinite(d.getTime())) throw new Error(key); return d;
}

export async function POST(request: NextRequest) {
  if(!secretMatches(request.headers.get("x-webhook-secret"),process.env.N8N_WEBHOOK_SECRET)) return NextResponse.json({error:"Niet geautoriseerd"},{status:401});
  const body=await request.json().catch(()=>null);
  if(!body || !Array.isArray(body.signals) || body.signals.length>100) return NextResponse.json({error:"Maximaal 100 signalen per batch"},{status:400});
  try {
    const rows = body.signals.map((r:Record<string,unknown>) => {
      const postcode=string(r,"postcode",true)!; const houseNumber=string(r,"houseNumber",true)!;
      if(!/^[1-9]\d{3}[A-Z]{2}$/.test(postcode) || !/^\d{1,5}$/.test(houseNumber) || !/^(A\+{0,5}|[B-G])$/.test(String(r.label))) throw new Error("adres/label");
      if(typeof r.current!=="boolean" || typeof r.baseline!=="boolean" || !["matched","pending","outside"].includes(String(r.areaStatus))) throw new Error("status");
      const houseLetter=string(r,"houseLetter"), houseAddition=string(r,"houseAddition");
      return {sourceKey:string(r,"sourceKey",true)!,objectKey:string(r,"objectKey",true)!,bagId:string(r,"bagId"),canonicalKey:labelAddressKey(postcode,houseNumber,houseLetter||"",houseAddition||""),postcode,houseNumber,houseLetter,houseAddition,
        detail:string(r,"detail"),street:string(r,"street"),city:string(r,"city"),municipality:string(r,"municipality"),areaStatus:string(r,"areaStatus",true)!,label:string(r,"label",true)!,previousLabel:string(r,"previousLabel"),buildingType:string(r,"buildingType"),buildingStatus:string(r,"buildingStatus"),
        registeredAt:date(r,"registeredAt")!,inspectedAt:date(r,"inspectedAt")!,validUntil:date(r,"validUntil",false),detectedAt:date(r,"detectedAt")!,sourceDate:date(r,"sourceDate")!,baseline:r.baseline as boolean,current:r.current as boolean};
    });
    await prisma.$transaction(async tx => {
      for(const row of rows) {
        // Discovery time and baseline are immutable across retries and replacements.
        const {detectedAt,baseline,previousLabel,...update}=row;
        await tx.energyLabelSignal.upsert({where:{sourceKey:row.sourceKey},create:{...update,detectedAt,baseline,previousLabel},update});
      }
    }, {timeout:60000});
    if(body.health && typeof body.health === "object") {
      // Only accept operational fields; never persist arbitrary worker configuration.
      const h=body.health;
      const value={status:String(h.status||"unknown").slice(0,30),lastAttemptAt:new Date().toISOString(),lastSuccessAt:h.lastSuccessAt||null,throughDate:h.throughDate||null,totalFile:h.totalFile||null,historyGap:!!h.historyGap,pendingAddresses:Number(h.pendingAddresses||0),currentLabels:Number(h.currentLabels||0),error:typeof h.error==="string"?h.error.slice(0,300):null};
      await prisma.appSetting.upsert({where:{key:"energy_label_monitor"},create:{key:"energy_label_monitor",value},update:{value}});
    }
    if(body.complete === true) {
      await reconcileEnergyLabels();
      await prisma.energyLabelSignal.deleteMany({where:{detectedAt:{lt:new Date(Date.now()-366*DAY)}}});
    }
    return NextResponse.json({accepted:rows.length});
  } catch(error) {
    if(!(error instanceof Prisma.PrismaClientKnownRequestError) && error instanceof Error && !error.message.includes("prisma")) return NextResponse.json({error:"Ongeldig signaal of verwerking mislukt"},{status:400});
    console.error("Energielabelimport mislukt");
    return NextResponse.json({error:"Import mislukt; batch kan veilig opnieuw"},{status:500});
  }
}
