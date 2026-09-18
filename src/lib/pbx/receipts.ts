import { prisma } from "@/lib/prisma";
export async function applyReceipt(providerId:string) {
  const receipt=await prisma.waProviderReceipt.findUnique({where:{providerId}});
  if(!receipt)return;
  if(receipt.ack>=3)await prisma.waMessage.updateMany({where:{evolutionMsgId:providerId},data:{deliveryStatus:"READ",readAt:receipt.updatedAt}});
  else if(receipt.ack===2)await prisma.waMessage.updateMany({where:{evolutionMsgId:providerId,OR:[{deliveryStatus:null},{deliveryStatus:{not:"READ"}}]},data:{deliveryStatus:"DELIVERED"}});
}
export async function receiveReceipt(providerId:string,ack:number) {
  if(providerId.length>191||!Number.isInteger(ack)||ack<2||ack>4)return;
  await prisma.waProviderReceipt.upsert({where:{providerId},create:{providerId,ack},update:{}});
  await prisma.waProviderReceipt.updateMany({where:{providerId,ack:{lt:ack}},data:{ack}});
  await applyReceipt(providerId);
}
