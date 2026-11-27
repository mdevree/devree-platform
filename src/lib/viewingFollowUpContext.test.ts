import assert from "node:assert/strict";
import test from "node:test";
import { appointmentFollowUp, isMailNote, isOriginalViewingConfirmation, nextAppointment } from "./viewingFollowUpContext";

const source = { mauticContactId: 123, agrcode: "ABC", relationRelationid: "10" };
const when = new Date("2026-12-01T14:00:00Z");
const viewing = { ...source, mauticContactId: null, agbegin: when, agstatus: "Definitief", agtype: "Bezichtiging", agdescr: "Testlaan 1, 1234 AB Stad" };

test("ongekoppelde vervolgbezichtiging wordt gebruikt met Nederlandse dag en lokale tijd", () => {
  const next = nextAppointment(source, [viewing]);
  assert.deepEqual(next, { when, address: "Testlaan 1" });
  const message = appointmentFollowUp("Kijker", "Voorbeeldstraat 2", next!, "https://example.test");
  assert.match(message, /dinsdag 1 december.*15:00/);
  assert.match(message, /bij Testlaan 1/);
  assert.doesNotMatch(message, /plannen|zoektocht/);
});

test("bij conflicterende of onbevestigde afspraken is beoordeling nodig", () => {
  assert.throws(() => nextAppointment(source, [{ ...viewing, relationRelationid: "20" }]));
  assert.throws(() => nextAppointment(source, [{ ...viewing, mauticContactId: 234 }]));
  assert.throws(() => nextAppointment(source, [{ ...viewing, agstatus: "Reservering" }]));
  assert.equal(nextAppointment(source, [{ ...viewing, agstatus: "Geannuleerd" }]), null);
});

test("onderscheid ontvangen mail, de eigen afspraakbevestiging en een andere woning", () => {
  const text = "📧 Email verzonden - 25 november<br>Onderwerp: Bezichtiging: Voorbeeldstraat 20 te Stad<br>Beste kijker";
  assert.ok(isMailNote(text));
  assert.ok(isMailNote(text.replace("verzonden", "ontvangen")));
  assert.ok(!isMailNote("Notitie over een e-mail"));
  assert.ok(isOriginalViewingConfirmation(text, "Voorbeeldstraat 20"));
  assert.ok(!isOriginalViewingConfirmation(text, "Voorbeeldstraat 2"));
  assert.ok(!isOriginalViewingConfirmation(text.replace("verzonden", "ontvangen"), "Voorbeeldstraat 20"));
});
