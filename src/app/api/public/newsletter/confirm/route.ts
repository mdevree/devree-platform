import {NextRequest} from 'next/server';
import {confirm} from '@/lib/newsletter/signup';
import {preflight,publicPost} from '@/lib/newsletter/publicHttp';
export const OPTIONS=preflight;
export async function POST(request:NextRequest){return publicPost(request,data=>confirm(data.token));}
