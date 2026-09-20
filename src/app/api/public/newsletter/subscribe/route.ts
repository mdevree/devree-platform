import {NextRequest} from 'next/server';
import {subscribe} from '@/lib/newsletter/signup';
import {preflight,publicPost} from '@/lib/newsletter/publicHttp';
export const OPTIONS=preflight;
export async function POST(request:NextRequest){return publicPost(request,data=>subscribe(data,(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim()));}
