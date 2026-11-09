import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { queueSearcherIngest } from "@/lib/realworksSearcherSync";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, x-webhook-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
export async function OPTIONS(){return new NextResponse(null,{status:204,headers});}
export async function POST(request:NextRequest){
  if(!await isAuthorized(request))return NextResponse.json({error:"Niet geautoriseerd"},{status:401,headers});
  const body=await request.json().catch(()=>null);
  if(!body || !Array.isArray(body.searchers) || !Array.isArray(body.results) || body.searchers.length>100 || body.results.length>100)
    return NextResponse.json({error:"Ongeldige zoekersbatch"},{status:400,headers});
  try { return NextResponse.json({success:true,...await queueSearcherIngest(body)},{headers}); }
  catch {return NextResponse.json({error:"Zoekersbatch niet volledig verwerkt; opnieuw proberen"},{status:503,headers});}
}
