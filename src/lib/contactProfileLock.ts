import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
export async function withProfileLock<T>(scope:string,work:()=>Promise<T>):Promise<T>{
 const key='profile_lock:'+scope,token=randomUUID();
 await prisma.appSetting.upsert({where:{key},create:{key,value:{}},update:{}});
 const granted=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM app_settings WHERE \`key\`=${key} FOR UPDATE`;
  const row=await tx.appSetting.findUniqueOrThrow({where:{key}});const v=row.value as {expiresAt?:number};
  if((v.expiresAt||0)>Date.now())return false;
  await tx.appSetting.update({where:{key},data:{value:{token,expiresAt:Date.now()+600000}}});return true;
 });
 if(!granted)throw Error('Profile busy; retry');
 try{return await work();}finally{await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM app_settings WHERE \`key\`=${key} FOR UPDATE`;
  const row=await tx.appSetting.findUniqueOrThrow({where:{key}});
  if((row.value as {token?:string}).token===token)await tx.appSetting.update({where:{key},data:{value:{}}});
 });}
}
