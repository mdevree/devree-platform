import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppMessageId } from "../whatsapp-message-id";
export async function applyReceipt(providerId:string) {
  providerId=normalizeWhatsAppMessageId(providerId);
  const receipt=await prisma.waProviderReceipt.findUnique({where:{providerId}});
  if(!receipt)return;
  // Include older rows saved with WAHA's serialized chat prefix.
  const identity={OR:[{evolutionMsgId:providerId},...['lid','c.us','s.whatsapp.net','g.us'].map(domain=>({evolutionMsgId:{endsWith:`@${domain}_${providerId}`}}))]};
  if(receipt.ack>=3)await prisma.waMessage.updateMany({where:identity,data:{deliveryStatus:"READ",readAt:receipt.updatedAt}});
  else if(receipt.ack===2)await prisma.waMessage.updateMany({where:{AND:[identity,{OR:[{deliveryStatus:null},{deliveryStatus:{not:"READ"}}]}]},data:{deliveryStatus:"DELIVERED"}});
}
export async function receiveReceipt(providerId:string,ack:number) {
  providerId=normalizeWhatsAppMessageId(providerId);
  if(providerId.length>191||!Number.isInteger(ack)||ack<2||ack>4)return;
  await prisma.waProviderReceipt.upsert({where:{providerId},create:{providerId,ack},update:{}});
  await prisma.waProviderReceipt.updateMany({where:{providerId,ack:{lt:ack}},data:{ack}});
  await applyReceipt(providerId);
}
