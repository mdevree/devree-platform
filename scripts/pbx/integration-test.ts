/** Isolated MySQL only: deliberately refuses any production database name. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { receivePbxEvent } from '../../src/lib/pbx/store';
import { saveRecording, readRecording, purgeRecordings } from '../../src/lib/pbx/recordings';
import { receiveReceipt, applyReceipt } from '../../src/lib/pbx/receipts';
async function main(){
  if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/pbx_reception_test_'))throw new Error('Test database required');
  const user=await prisma.user.create({data:{name:'Melvin PBX Test',email:`pbx-${randomUUID()}@example.invalid`,password:'not-a-login',role:'manager'}});
  await prisma.appSetting.create({data:{key:'pbx.reception.config',value:{version:1,mode:'available',awayUntil:null,closedDates:[],ownerId:user.id}}});
  const base={eventId:'test:1',callId:'test',revision:1,kind:'callback' as const,phone:'+31612345678',receivedAt:new Date().toISOString(),consentAt:new Date().toISOString()};
  const results=await Promise.all(Array.from({length:4},()=>receivePbxEvent(base)));
  assert.equal(new Set(results.map(r=>r!.id)).size,1);assert.equal(await prisma.task.count(),1);assert.equal(await prisma.pbxOutbox.count(),1);
  await Promise.all([receivePbxEvent({...base,eventId:'second:1',callId:'second'}),receivePbxEvent({...base,eventId:'third:1',callId:'third'})]);
  assert.equal(await prisma.pbxRequest.count(),3);assert.equal(await prisma.task.count(),1);assert.equal(await prisma.pbxOutbox.count(),1);
  await receivePbxEvent({...base,eventId:'test:3',revision:3});await receivePbxEvent({...base,eventId:'test:2',revision:2,consentAt:null});
  const row=await prisma.pbxRequest.findUniqueOrThrow({where:{callId:'test'}});assert.equal(row.revision,3);assert.ok(row.consentAt);
  const noConsent=await receivePbxEvent({...base,eventId:'hidden:1',callId:'hidden',phone:null,consentAt:null});
  assert.ok(noConsent!.taskId);assert.equal(await prisma.pbxOutbox.count(),1);
  await receivePbxEvent({...base,eventId:'view:1',callId:'view',kind:'viewing'});await receivePbxEvent({...base,eventId:'view2:1',callId:'view2',kind:'viewing'});
  assert.equal(await prisma.pbxOutbox.count(),2);
  const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
  const hash=createHash('sha256').update(wav).digest('hex');
  await saveRecording(row.id,wav,hash);await saveRecording(row.id,wav,hash);assert.deepEqual(await readRecording(row.id),wav);
  await assert.rejects(saveRecording(row.id,wav,'0'.repeat(64)));
  await prisma.task.update({where:{id:row.taskId!},data:{status:'afgerond',completedAt:new Date(Date.now()-31*86400000)}});
  assert.equal(await purgeRecordings(),1);assert.equal((await saveRecording(row.id,wav,hash)).expired,true);await assert.rejects(readRecording(row.id));
  const next=await receivePbxEvent({...base,eventId:'new:1',callId:'new'});assert.notEqual(next!.taskId,row.taskId);
  await receiveReceipt('receipt-before-message',3);
  const conv=await prisma.waConversation.create({data:{waPhone:'31612345678@s.whatsapp.net'}});
  await prisma.waMessage.create({data:{conversationId:conv.id,direction:'OUTBOUND',body:'test',evolutionMsgId:'receipt-before-message',deliveryStatus:'SENT'}});
  await applyReceipt('receipt-before-message');await receiveReceipt('receipt-before-message',2);
  assert.equal((await prisma.waMessage.findUniqueOrThrow({where:{evolutionMsgId:'receipt-before-message'}})).deliveryStatus,'READ');
  console.log('PASS: transactional deduplication, concurrent grouping, out-of-order events, consent, hidden number, viewing rate limit, recording checksums/retention, reopened callback, early/out-of-order receipts');
}
main().finally(()=>prisma.$disconnect()).catch(e=>{console.error(e);process.exitCode=1;});
