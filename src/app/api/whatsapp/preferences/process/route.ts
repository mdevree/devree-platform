import { NextRequest,NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/apiAuth';
import { runPreferenceWorker } from '@/lib/whatsappPreferenceWorker';
export async function POST(req:NextRequest){
 if(!await isAuthorized(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json(await runPreferenceWorker());}catch{return NextResponse.json({error:'Worker unavailable or busy; retry later'},{status:503});}
}
