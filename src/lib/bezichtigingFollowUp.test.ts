import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BEZICHTIGING_FOLLOWUP_SETTINGS,
  berekenVenster,
  beslisFollowUp,
  dagLabelVoor,
  metRcode,
  renderFollowUpTemplate,
  type ContactSignals,
  type FollowUpKandidaat,
} from "./bezichtigingFollowUp";
import { isBezichtigingType } from "./agendaEnrich";
import { toWhatsAppJid } from "./phone";

const NOW = new Date("2026-07-11T10:00:00+02:00");
// 30 uur geleden: netjes binnen het 24-48u venster.
const BEZICHTIGING = new Date(NOW.getTime() - 30 * 3_600_000);

const SETTINGS = { ...DEFAULT_BEZICHTIGING_FOLLOWUP_SETTINGS };

const KANDIDAAT: FollowUpKandidaat = {
  afspraakId: "afspraak-1",
  agtype: "Bezichtiging",
  agbegin: BEZICHTIGING,
  aginactive: false,
  mauticContactId: 42,
  contactTelefoon: "0612345678",
};

const GEEN_SIGNALEN: ContactSignals = {
  bestaandDraftVoorAfspraak: false,
  laatsteWaInboundAt: null,
  laatsteWaOutboundAt: null,
  laatsteAnsweredCallAt: null,
  laatsteEmailSendAt: null,
  anderDraftVoorContactAt: null,
  actieveAiCallJob: false,
};

function urenNaBezichtiging(uren: number): Date {
  return new Date(BEZICHTIGING.getTime() + uren * 3_600_000);
}

test("maakt concept voor bezichtiging binnen venster zonder contact", () => {
  const beslissing = beslisFollowUp(KANDIDAAT, GEEN_SIGNALEN, NOW, SETTINGS);
  assert.deepEqual(beslissing, { maakConcept: true });
});

test("skipt niet-bezichtigingen en geannuleerde afspraken", () => {
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, agtype: "Verkoopgesprek" }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "geen_bezichtiging" },
  );
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, aginactive: true }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "geannuleerd" },
  );
});

test("skipt bezichtigingen buiten het 24-48u venster", () => {
  const teRecent = new Date(NOW.getTime() - 12 * 3_600_000);
  const teOud = new Date(NOW.getTime() - 72 * 3_600_000);
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, agbegin: teRecent }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "buiten_venster" },
  );
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, agbegin: teOud }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "buiten_venster" },
  );
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, agbegin: null }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "buiten_venster" },
  );
});

test("skipt bij bestaand concept of actieve belkaart voor de afspraak", () => {
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, bestaandDraftVoorAfspraak: true }, NOW, SETTINGS),
    { maakConcept: false, reason: "al_concept_voor_afspraak" },
  );
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, actieveAiCallJob: true }, NOW, SETTINGS),
    { maakConcept: false, reason: "ai_belafspraak_actief" },
  );
});

test("outbound WhatsApp vóór de bezichtiging telt niet, erná wel", () => {
  const bevestigingVooraf = beslisFollowUp(
    KANDIDAAT,
    { ...GEEN_SIGNALEN, laatsteWaOutboundAt: urenNaBezichtiging(-4) },
    NOW,
    SETTINGS,
  );
  assert.deepEqual(bevestigingVooraf, { maakConcept: true });

  const opgevolgd = beslisFollowUp(
    KANDIDAAT,
    { ...GEEN_SIGNALEN, laatsteWaOutboundAt: urenNaBezichtiging(2) },
    NOW,
    SETTINGS,
  );
  assert.deepEqual(opgevolgd, { maakConcept: false, reason: "recent_whatsapp_contact" });
});

test("inbound WhatsApp binnen het voorloopvenster telt als lopend gesprek", () => {
  const lopendGesprek = beslisFollowUp(
    KANDIDAAT,
    { ...GEEN_SIGNALEN, laatsteWaInboundAt: urenNaBezichtiging(-24) },
    NOW,
    SETTINGS,
  );
  assert.deepEqual(lopendGesprek, { maakConcept: false, reason: "recent_whatsapp_contact" });

  const oudBericht = beslisFollowUp(
    KANDIDAAT,
    { ...GEEN_SIGNALEN, laatsteWaInboundAt: urenNaBezichtiging(-72) },
    NOW,
    SETTINGS,
  );
  assert.deepEqual(oudBericht, { maakConcept: true });
});

test("beantwoord telefoongesprek en verzonden e-mail na bezichtiging skippen", () => {
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, laatsteAnsweredCallAt: urenNaBezichtiging(3) }, NOW, SETTINGS),
    { maakConcept: false, reason: "recent_telefonisch_contact" },
  );
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, laatsteAnsweredCallAt: urenNaBezichtiging(-3) }, NOW, SETTINGS),
    { maakConcept: true },
  );
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, laatsteEmailSendAt: urenNaBezichtiging(1) }, NOW, SETTINGS),
    { maakConcept: false, reason: "recent_email_contact" },
  );
});

test("ander concept voor hetzelfde contact na de bezichtiging skipt", () => {
  assert.deepEqual(
    beslisFollowUp(KANDIDAAT, { ...GEEN_SIGNALEN, anderDraftVoorContactAt: urenNaBezichtiging(5) }, NOW, SETTINGS),
    { maakConcept: false, reason: "recent_concept_zelfde_contact" },
  );
});

test("skipt zonder contactkoppeling of bruikbaar telefoonnummer", () => {
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, mauticContactId: null }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "geen_contact_koppeling" },
  );
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, contactTelefoon: null }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "geen_telefoonnummer" },
  );
  assert.deepEqual(
    beslisFollowUp({ ...KANDIDAAT, contactTelefoon: "12" }, GEEN_SIGNALEN, NOW, SETTINGS),
    { maakConcept: false, reason: "geen_telefoonnummer" },
  );
});

test("berekenVenster geeft 24-48u venster", () => {
  const venster = berekenVenster(NOW, SETTINGS);
  assert.equal(venster.from.toISOString(), new Date(NOW.getTime() - 48 * 3_600_000).toISOString());
  assert.equal(venster.to.toISOString(), new Date(NOW.getTime() - 24 * 3_600_000).toISOString());
});

test("renderFollowUpTemplate vult placeholders en laat onbekende staan", () => {
  const body = renderFollowUpTemplate("Hallo {naam}, over {woningTitel}: {woningUrl} {onbekend}", {
    naam: "Sanne",
    woningTitel: "Kikkerven 255",
    woningUrl: "https://example.com/woning",
  });
  assert.equal(body, "Hallo Sanne, over Kikkerven 255: https://example.com/woning {onbekend}");
});

test("metRcode voegt tracking toe aan de woninglink", () => {
  assert.equal(metRcode("https://x.nl/woning/", "882456", true), "https://x.nl/woning/?rcode=882456");
  assert.equal(metRcode("https://x.nl/woning/?a=1", "882456", true), "https://x.nl/woning/?a=1&rcode=882456");
  assert.equal(metRcode("https://x.nl/woning/", null, true), "https://x.nl/woning/");
  assert.equal(metRcode("https://x.nl/woning/", "882456", false), "https://x.nl/woning/");
});

test("dagLabelVoor geeft leesbare labels", () => {
  const now = new Date("2026-07-11T10:00:00+02:00"); // zaterdag
  assert.equal(dagLabelVoor(new Date("2026-07-10T19:00:00+02:00"), now), "gisteren");
  assert.equal(dagLabelVoor(new Date("2026-07-09T10:00:00+02:00"), now), "eergisteren");
  assert.equal(dagLabelVoor(new Date("2026-07-07T10:00:00+02:00"), now), "afgelopen dinsdag");
});

test("isBezichtigingType herkent bezichtigingen en viewings", () => {
  assert.equal(isBezichtigingType("Bezichtiging"), true);
  assert.equal(isBezichtigingType("2e bezichtiging"), true);
  assert.equal(isBezichtigingType("Viewing"), true);
  assert.equal(isBezichtigingType("Verkoopgesprek"), false);
  assert.equal(isBezichtigingType(null), false);
});

test("toWhatsAppJid normaliseert NL-nummers naar JID", () => {
  assert.equal(toWhatsAppJid("0612345678"), "31612345678@s.whatsapp.net");
  assert.equal(toWhatsAppJid("+31 6 12 34 56 78"), "31612345678@s.whatsapp.net");
  assert.equal(toWhatsAppJid("612345678"), "31612345678@s.whatsapp.net");
  assert.equal(toWhatsAppJid("0031612345678"), "31612345678@s.whatsapp.net");
  assert.equal(toWhatsAppJid("12"), null);
  assert.equal(toWhatsAppJid(""), null);
});
