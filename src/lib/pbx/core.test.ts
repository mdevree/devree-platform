import test from "node:test";
import assert from "node:assert/strict";
import { normalizePbxPhone, callbackDue, effectiveMode, defaultPbxConfig, parsePbxEvent, sendingAllowed, validateConfig } from "./core";
test('PBX nummernormalisatie weigert verborgen, verkorte en script-invoer',()=>{
  for(const v of ['0612345678','+31 6 12345678','0031612345678','31612345678'])assert.equal(normalizePbxPhone(v),'+31612345678');
  for(const v of ['anonymous','201','+310612345678','../123','+31612345678;exec',null])assert.equal(normalizePbxPhone(v),null);
  assert.equal(normalizePbxPhone('+442071234567'),'+442071234567');
});
test('afwezigheid verloopt lokaal en gesloten uren krijgen voorrang',()=>{
  const c={...defaultPbxConfig,mode:'away' as const,awayUntil:'2026-09-18T10:00:00Z'};
  assert.equal(effectiveMode(c,new Date('2026-09-18T09:59:00Z')),'away');
  assert.equal(effectiveMode(c,new Date('2026-09-18T10:00:00Z')),'available');
  assert.equal(effectiveMode(c,new Date('2026-09-18T06:59:00Z')),'closed');
  assert.equal(effectiveMode({...c,closedDates:['2026-09-18']},new Date('2026-09-18T09:00:00Z')),'closed');
});
test('terugbeldeadline volgt openingsdagen, sluitingsdagen en zomertijd',()=>{
  assert.equal(callbackDue(new Date('2026-09-18T08:00Z')).toISOString(),'2026-09-18T15:30:00.000Z');
  assert.equal(callbackDue(new Date('2026-09-18T16:00Z')).toISOString(),'2026-09-19T11:00:00.000Z');
  assert.equal(callbackDue(new Date('2026-09-19T12:00Z')).toISOString(),'2026-09-21T15:30:00.000Z');
  assert.equal(callbackDue(new Date('2026-10-24T12:00Z')).toISOString(),'2026-10-26T16:30:00.000Z');
  assert.equal(callbackDue(new Date('2026-09-18T16:00Z'),['2026-09-19']).toISOString(),'2026-09-21T15:30:00.000Z');
});
test('gebeurtenis vereist stabiele identiteit, toestemming en geldig nummer',()=>{
  const e={eventId:'call:1',callId:'call',revision:1,kind:'callback',phone:'0612345678',receivedAt:'2026-09-18T08:00Z',consentAt:null};
  assert.equal(parsePbxEvent(e).phone,'+31612345678');
  assert.throws(()=>parsePbxEvent({...e,callId:'../secret'}));
  assert.throws(()=>parsePbxEvent({...e,phone:null,consentAt:e.receivedAt}));
  assert.throws(()=>parsePbxEvent({...e,kind:'missed',consentAt:e.receivedAt}));
});
test('WhatsApp staat standaard uit; testmodus gebruikt een exacte allowlist',()=>{
  assert.equal(sendingAllowed('+31612345678',undefined,'0612345678'),false);
  assert.equal(sendingAllowed('+31612345678','test','0612345678'),true);
  assert.equal(sendingAllowed('+31612345679','test','0612345678'),false);
  assert.equal(sendingAllowed('+31612345678','live',''),true);
});
test('buiten de deur vereist een toekomstig einde',()=>{
  assert.throws(()=>validateConfig({mode:'away'},defaultPbxConfig));
  assert.throws(()=>validateConfig({mode:'away',awayUntil:'2000-01-01'},defaultPbxConfig));
  assert.throws(()=>validateConfig({mode:'available',closedDates:['2026-02-30']},defaultPbxConfig));
});
