import { NextRequest, NextResponse } from 'next/server';
import { SignupError } from './signup';
export function publicHeaders(request:NextRequest){
 const origin=request.headers.get('origin')||'';
 const allowed=['https://www.devreemakelaardij.nl','https://devreemakelaardij.nl',process.env.NEWSLETTER_PUBLIC_ORIGIN||'https://kantoor.devreemakelaardij.nl'];
 if(process.env.NODE_ENV==='development')allowed.push('http://localhost:3100');
 if(!allowed.includes(origin))throw new SignupError('Deze aanmelding is niet toegestaan.',403);
 return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
}
export function preflight(request:NextRequest){try{return new NextResponse(null,{status:204,headers:publicHeaders(request)});}catch{return NextResponse.json({error:'Niet toegestaan'},{status:403});}}
export async function publicPost(request:NextRequest,fn:(data:Record<string,unknown>)=>Promise<string>){
 let headers:Record<string,string>={};
 try{headers=publicHeaders(request);if(Number(request.headers.get('content-length'))>4096)throw new SignupError('Ongeldige aanvraag.');const raw=await request.text();if(raw.length>4096)throw new SignupError('Ongeldige aanvraag.');const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw new SignupError('Ongeldige aanvraag.');return NextResponse.json({message:await fn(data)},{headers});}
 catch(e){return NextResponse.json({error:e instanceof SignupError?e.message:'Aanmelden lukt tijdelijk niet.'},{status:e instanceof SignupError?e.status:503,headers});}
}
