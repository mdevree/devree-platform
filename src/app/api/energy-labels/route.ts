import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { DAY, conversionMetrics } from "@/lib/energyLabelRules";

export async function GET(request:NextRequest) {
  if(!await isAuthorized(request)) return NextResponse.json({error:"Niet ingelogd"},{status:401});
  const p=request.nextUrl.searchParams;
  const days=[30,60,90,180,365].includes(Number(p.get("days")))?Number(p.get("days")):90;
  const city=p.get("city")||""; const status=p.get("status")||"all";
  const page=Math.max(1,Math.min(10000,Math.floor(Number(p.get("page"))||1)));
  const [all,setting]=await Promise.all([
    prisma.energyLabelSignal.findMany({where:{detectedAt:{gte:new Date(Date.now()-366*DAY)}},orderBy:[{registeredAt:"desc"},{sourceKey:"asc"}]}),
    prisma.appSetting.findUnique({where:{key:"energy_label_monitor"}}),
  ]);
  const now=new Date();
  const groups=new Map<string,Set<string>>();
  for(const s of all.filter(s=>s.street && s.city)) {
    const k=`${s.city}:${s.street}:${s.registeredAt.toISOString().slice(0,10)}`;
    groups.set(k,new Set([...(groups.get(k)||[]),s.objectKey]));
  }
  const objectKeys=new Map<string,Set<string>>();
  for(const s of all) objectKeys.set(s.canonicalKey,new Set([...(objectKeys.get(s.canonicalKey)||[]),s.objectKey]));
  const enriched=all.map(s=>({...s,areaStatus:(objectKeys.get(s.canonicalKey)!.size>1 || s.detail)?"pending":s.areaStatus,
    groupSize:groups.get(`${s.city}:${s.street}:${s.registeredAt.toISOString().slice(0,10)}`)?.size||1,
    status:!s.current || (s.validUntil && s.validUntil<now)?"withdrawn":s.knownAtDiscovery?"known":s.firstListedAt?"listed":"unseen"}));
  const scope=enriched.filter(s=>(!city || s.city===city) && s.areaStatus!=="outside");
  const rows=scope.filter(s=>s.registeredAt.getTime()>=now.getTime()-days*DAY && (status==="all" || s.status===status));
  const health=setting?.value as Record<string,unknown>|null;
  const last=health?.lastSuccessAt ? new Date(String(health.lastSuccessAt)).getTime() : 0;
  const through=health?.throughDate ? new Date(String(health.throughDate)).getTime() : 0;
  const stale=!last || now.getTime()-last>48*3600000 || !through || now.getTime()-through>72*3600000;
  return NextResponse.json({signals:rows.slice((page-1)*50,page*50),total:rows.length,page,pageSize:50,
    cities:[...new Set(enriched.map(s=>s.city).filter(Boolean))].sort(),
    metrics:conversionMetrics(scope,now),
    health:{...health,stale,status:stale?"attention":health?.status||"not_configured"},
    counts:{unseen:rows.filter(s=>s.status==="unseen").length,listed:rows.filter(s=>s.status==="listed" && s.listingKind==="sale").length,baseline:rows.filter(s=>s.baseline).length,pending:rows.filter(s=>s.areaStatus==="pending").length},
    breakdown:[...new Set(scope.map(s=>s.city||"Onbekend"))].sort().map(name=>({city:name,metrics:conversionMetrics(scope.filter(s=>(s.city||"Onbekend")===name),now)})),
    groupedMetrics:conversionMetrics(scope.filter(s=>s.groupSize>1),now),singleMetrics:conversionMetrics(scope.filter(s=>s.groupSize===1),now),
  });
}
