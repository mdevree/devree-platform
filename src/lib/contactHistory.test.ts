import { test } from "node:test";
import assert from "node:assert/strict";
import { historyPage, mirroredAppointmentEvent, type HistoryItem } from "./contactHistory";
test("cursorpaginering verliest geen items met hetzelfde tijdstip", () => {
  const items: HistoryItem[] = Array.from({length: 121}, (_,i) => ({id: `event:${i}`, at: "2026-09-09T10:00:00.000Z", category: "activity", title: "test", source: "test"}));
  const a = historyPage(items,null,null); const b = historyPage(items,a.nextCursor,null); const c = historyPage(items,b.nextCursor,null);
  assert.equal(a.items.length,50); assert.equal(b.items.length,50); assert.equal(c.items.length,21);
  assert.equal(new Set([...a.items,...b.items,...c.items].map(i=>i.id)).size,121); assert.equal(c.nextCursor,null);
});
test("filter en cursorvalidering", () => {
  assert.deepEqual(historyPage([{id:"call:1",at:"2026-09-09T10:00:00.000Z", category:"calls",title:"call",source:"Telefonie"}],null,"activity").items,[]);
  assert.throws(()=>historyPage([],"ongeldig",null));
});
test("ontdubbel alleen herkenbare Mautic-kopieen", () => {
  const createdAt = new Date("2026-09-09T10:00:00Z");
  const original = {eventType:"page_open",createdAt,path:"/afspraak/test"};
  assert.equal(mirroredAppointmentEvent({eventType:"appointment.page_open",occurredAt:createdAt,clickedUrl:original.path},[original]),true);
  assert.equal(mirroredAppointmentEvent({eventType:"page.hit",occurredAt:createdAt,clickedUrl:original.path},[original]),false);
  assert.equal(mirroredAppointmentEvent({eventType:"appointment.page_open",occurredAt:createdAt,clickedUrl:"/afspraak/ander"},[original]),false);
});

test("historische spiegeling met millisecondeverschil vereist dezelfde sessie", () => {
  const createdAt = new Date("2026-09-09T10:00:00.004Z");
  const original = {eventType:"page_open",createdAt,path:"/afspraak/test",sessionId:"sessie"};
  const event = {eventType:"appointment.page_open",occurredAt:new Date("2026-09-09T10:00:00Z"),clickedUrl:original.path,rawPayload:{sessionId:"sessie"}};
  assert.equal(mirroredAppointmentEvent(event,[original]),true);
  assert.equal(mirroredAppointmentEvent({...event,rawPayload:{sessionId:"andere"}},[original]),false);
});
