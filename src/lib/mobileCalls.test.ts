import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileCall,mobileCallHash,mobileNoteText,deliverMobileNote,type MobileCallInput} from './mobileCalls';
const input:MobileCallInput={requestId:'11111111-2222-4333-8444-555555555555',contactId:123,direction:'inbound',connected:true,contactConfirmed:true,startedAt:'2026-11-10T10:00:00Z',endedAt:'2026-11-10T10:10:00Z',note:'Vrijdag terugbellen over parkeren.'};
const now=Date.parse('2026-11-10T11:00:00Z');
test('missed, unanswered and unconfirmed calls are rejected before persistence',()=>{
 for(const direction of ['inbound','outbound'])assert.throws(()=>validateMobileCall({...input,direction,connected:false},now));
 assert.throws(()=>validateMobileCall({...input,contactConfirmed:false},now));
});
test('times and notes must be valid; normalized retries have the same identity',()=>{
 assert.throws(()=>validateMobileCall({...input,endedAt:'2026-11-10T09:00:00Z'},now));
 assert.throws(()=>validateMobileCall({...input,note:' '},now));
 assert.throws(()=>validateMobileCall({...input,startedAt:'invalid'},now));
 const v=validateMobileCall(input,now);assert.equal(mobileCallHash(v),mobileCallHash(validateMobileCall({...input,note:' '+input.note+' '},now)));
 assert.notEqual(mobileCallHash(v),mobileCallHash({...v,contactId:456}));
});
test('notes are escaped and carry original event time and source identity',()=>{
 const text=mobileNoteText({...input,note:'<script>alert(1)</script>'},'Melvin');
 assert.ok(text.includes('&lt;script&gt;'));assert.ok(text.includes(input.requestId));assert.ok(text.includes(input.startedAt));assert.ok(!text.includes('<script>'));
});
test('repeated submission recovers existing Mautic note without creation',async()=>{
 let created=0;const id=await deliverMobileNote({find:async()=>42,verify:async id=>id===42,create:async()=>++created,beforeCreate:async()=>{}},undefined);
 assert.equal(id,42);assert.equal(created,0);
});
test('failed Mautic readback never reports success; recovery reuses committed note',async()=>{
 let existing:number|null=null,created=0,verified=false;
 const io={find:async()=>existing,verify:async()=>verified,create:async()=>{created++;existing=42;return 42;},beforeCreate:async()=>{}};
 await assert.rejects(()=>deliverMobileNote(io,undefined));verified=true;
 assert.equal(await deliverMobileNote(io,Date.now()),42);assert.equal(created,1);
});
test('ambiguous timeout has a cooldown and does not immediately duplicate',async()=>{
 let created=0;await assert.rejects(()=>deliverMobileNote({find:async()=>null,verify:async()=>true,create:async()=>++created,beforeCreate:async()=>{}},now-1000,now));assert.equal(created,0);
});
test('Mautic lookup outage must never cause a blind create',async()=>{
 let created=false;await assert.rejects(()=>deliverMobileNote({find:async()=>{throw Error('offline');},verify:async()=>true,create:async()=>{created=true;return 42;},beforeCreate:async()=>{}},undefined));assert.equal(created,false);
});
test('project selection survives validation and cannot change during a retry',()=>{
 const original=validateMobileCall(input,now);
 assert.equal(Object.hasOwn(original,'projectId'),false);
 const linked=validateMobileCall({...input,projectId:'taxatie-1'},now);
 assert.equal(linked.projectId,'taxatie-1');
 assert.notEqual(mobileCallHash(original),mobileCallHash(linked));
 assert.throws(()=>validateMobileCall({...input,projectId:42},now));
});
