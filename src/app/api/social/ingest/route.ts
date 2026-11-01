import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { date, parseRow } from '@/lib/social/rules';
import { ingest } from '@/lib/social/store';
export async function POST(req:NextRequest) {
 const a=req.headers.get('x-webhook-secret'), b=process.env.N8N_WEBHOOK_SECRET;
 if(!a||!b||Buffer.byteLength(a)!==Buffer.byteLength(b)||!timingSafeEqual(Buffer.from(a),Buffer.from(b)))return NextResponse.json({error:'Niet geautoriseerd'},{status:401});
 let batch;
 try { const body=await req.text();if(body.length>2000000)throw Error();const v=JSON.parse(body); if(!Array.isArray(v.rows)||v.rows.length>50)throw Error(); const capturedAt=date(v.capturedAt); if(!capturedAt || capturedAt.getTime()>Date.now()+60000)throw Error(); batch={rows:v.rows.map(parseRow),capturedAt,complete:v.complete===true,since:date(v.since)?.toISOString()||null}; }
 catch{return NextResponse.json({error:'Ongeldige import'},{status:400});}
 try {await ingest(batch.rows,batch.capturedAt,batch.complete,batch.since);return NextResponse.json({accepted:batch.rows.length});}
 catch {console.error('Social import failed');return NextResponse.json({error:'Import mislukt; herhalen is veilig'},{status:500});}
}
