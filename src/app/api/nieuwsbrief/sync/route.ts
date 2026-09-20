import {NextRequest,NextResponse} from 'next/server';
import {isAuthorized} from '@/lib/apiAuth';
import {runNewsletterSync} from '@/lib/newsletter/sync';
export async function POST(request:NextRequest){if(!await isAuthorized(request))return NextResponse.json({error:'Niet ingelogd'},{status:401});const data=await request.json().catch(()=>({}));return NextResponse.json(await runNewsletterSync(data.month===true,data.first===true));}
