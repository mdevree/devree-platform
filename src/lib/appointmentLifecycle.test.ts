import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentPhase, appointmentPeriod, appointmentWhatsappUrl } from "./appointmentLifecycle";
const start = new Date("2026-09-09T10:00:00Z");
const end = new Date("2026-09-09T10:30:00Z");
const base = { status: "sent", appointmentStart: start, appointmentEnd: end };
test("omschakelen op eindtijd en met ontbrekende eindtijd", () => {
  assert.equal(appointmentPhase(base, new Date(end.getTime()-1)), "before");
  assert.equal(appointmentPhase(base, end), "after");
  assert.equal(appointmentPhase({ ...base, appointmentEnd: null }, end), "after");
  assert.equal(appointmentPhase({ ...base, appointmentStart: null, appointmentEnd: null }, end), "before");
});
test("actuele agenda gaat boven oude bevestiging en annulering boven tijd", () => {
  const agendaAfspraak = { agbegin: new Date("2026-09-10T10:00:00Z"), agend: null, agstatus: null, aginactive: false };
  assert.equal(appointmentPhase({ ...base, agendaAfspraak }, end), "before");
  assert.equal(appointmentPhase({ ...base, agendaAfspraak: { ...agendaAfspraak, agbegin: null } }, end), "before");
  for (const status of ["cancel_requested", "cancelled"]) assert.equal(appointmentPhase({ ...base, status }, end), "cancelled");
  assert.equal(appointmentPhase({ ...base, agendaAfspraak: { ...agendaAfspraak, agstatus: "Geannuleerd" } }, end), "cancelled");
  assert.equal(appointmentPhase({ ...base, agendaAfspraak: { ...agendaAfspraak, aginactive: true } }, end), "cancelled");
});
test("statistieken scheiden voor, tijdens en na", () => {
  assert.equal(appointmentPeriod(base, new Date(start.getTime()-1)), "before");
  assert.equal(appointmentPeriod(base, start), "during");
  assert.equal(appointmentPeriod(base, end), "after");
  assert.equal(appointmentPeriod({ ...base, appointmentStart: null }, end), "unknown");
});
test("WhatsApp geeft adres en lokale datum als bewerkbare tekst mee", () => {
  const url = new URL(appointmentWhatsappUrl("Mekongstraat 38", start));
  assert.equal(url.hostname, "wa.me");
  assert.match(url.searchParams.get("text")!, /Mekongstraat 38 op 9 september 2026/);
});
