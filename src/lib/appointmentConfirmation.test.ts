import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentTokenHash,
  appointmentTokenFromPublicUrl,
  buildAppointmentCalendar,
  buildAppointmentWhatsappBody,
  createAppointmentToken,
  isValidAppointmentPreview,
  notifyOfficeAppointmentAction,
  publicAppointmentPreviewUrl,
} from "./appointmentConfirmation";

test("maakt veilige afspraak tokens en hashes", () => {
  const token = createAppointmentToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(appointmentTokenHash(token).length, 64);
  assert.notEqual(appointmentTokenHash(token), token);
});

test("haalt het token alleen uit een geldige publieke afspraaklink", () => {
  assert.equal(
    appointmentTokenFromPublicUrl("https://www.devreemakelaardij.nl/afspraak/test_token-1"),
    "test_token-1"
  );
  assert.equal(appointmentTokenFromPublicUrl("https://www.devreemakelaardij.nl/aanbod/"), null);
  assert.equal(appointmentTokenFromPublicUrl("geen-url"), null);
});

test("preview URL is tijdelijk geldig", () => {
  const token = "test-token";
  const preview = publicAppointmentPreviewUrl(token, 1000);
  const url = new URL(preview);
  assert.equal(url.pathname, "/afspraak/test-token");
  assert.equal(
    isValidAppointmentPreview(
      token,
      url.searchParams.get("previewUntil") || undefined,
      url.searchParams.get("previewSig") || undefined,
      1000
    ),
    true
  );
  assert.equal(
    isValidAppointmentPreview(token, "999", url.searchParams.get("previewSig") || undefined, 1000),
    false
  );
});

test("bouwt WhatsApptekst met woning, afspraakdatum en publieke link", () => {
  const body = buildAppointmentWhatsappBody({
    woningTitle: "Raaigras 6 SPIJKENISSE",
    woningAdres: "Raaigras 6, 3206 JK, SPIJKENISSE",
    appointmentStart: new Date("2026-08-27T13:00:00.000Z"),
    medewerker: "Melvin de Vree",
    publicUrl: "https://www.devreemakelaardij.nl/afspraak/abc",
  });

  assert.match(body, /^Goedemiddag,\n\n/);
  assert.match(body, /Aanstaande donderdag hebben wij een afspraak voor de bezichtiging van Raaigras 6 in Spijkenisse\./);
  assert.match(body, /https:\/\/www\.devreemakelaardij\.nl\/afspraak\/abc/);
  assert.match(body, /Anders zie ik u donderdag om 15\.00 uur bij de woning\./);
  assert.match(body, /Met vriendelijke groet,\n\nMelvin de Vree\nDe Vree Makelaardij$/);
});

test("bouwt een agenda-item met echte begin- en eindtijd", () => {
  const calendar = buildAppointmentCalendar({
    id: "confirmation-id",
    address: "Raaigras 6, 3206 JK Spijkenisse",
    start: new Date("2026-08-27T13:00:00.000Z"),
    end: new Date("2026-08-27T13:45:00.000Z"),
    publicUrl: "https://www.devreemakelaardij.nl/afspraak/abc",
    woningUrl: "https://www.devreemakelaardij.nl/woning/raaigras-6/",
    now: new Date("2026-08-25T10:00:00.000Z"),
  });

  assert.match(calendar, /DTSTART:20260827T130000Z\r\n/);
  assert.match(calendar, /DTEND:20260827T134500Z\r\n/);
  assert.match(calendar, /LOCATION:Raaigras 6\\, 3206 JK Spijkenisse/);
  assert.match(calendar, /google\.com\/maps\/search/);
  assert.match(calendar, /URL:https:\/\/www\.devreemakelaardij\.nl\/afspraak\/abc/);
});

test("stuurt kantoor een e-mail bij bevestigen of annuleren", async () => {
  const oldWebhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  const oldWebhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const oldFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];

  process.env.AI_INFO_EMAIL_WEBHOOK_URL = "https://example.test/mail";
  process.env.N8N_WEBHOOK_SECRET = "secret";
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    await notifyOfficeAppointmentAction({
      action: "confirmed",
      actionAt: new Date("2026-08-27T13:00:00.000Z"),
      confirmation: {
        id: "confirmation-id",
        agendaAfspraakId: "appointment-id",
        tokenHash: "hash",
        publicUrl: "https://www.devreemakelaardij.nl/afspraak/abc",
        previewUrl: null,
        status: "confirmed",
        recipientName: "Vincent Jansen",
        recipientPhone: "0612345678",
        recipientEmail: "vincent@example.test",
        mauticContactId: null,
        projectId: null,
        woningTitle: "Raaigras 6",
        woningAdres: "Raaigras 6, 3206 JK Spijkenisse",
        woningUrl: "https://www.devreemakelaardij.nl/aanbod/spijkenisse-raaigras-6/",
        woningImageUrl: null,
        appointmentStart: new Date("2026-08-27T13:00:00.000Z"),
        appointmentEnd: null,
        medewerker: "Melvin de Vree",
        whatsappBody: "",
        videoPath: null,
        videoOriginalName: null,
        videoMimeType: null,
        videoSizeBytes: null,
        videoPosterIndex: 0,
        sentAt: null,
        openedAt: null,
        lastOpenedAt: null,
        openCount: 0,
        videoStartedAt: null,
        videoCompletedAt: null,
        videoStartCount: 0,
        videoCompleteCount: 0,
        confirmedAt: new Date("2026-08-27T13:00:00.000Z"),
        cancelledAt: null,
        waConversationId: null,
        waMessageId: null,
        deliveryError: null,
        createdBy: "platform",
        createdAt: new Date("2026-08-23T10:00:00.000Z"),
        updatedAt: new Date("2026-08-23T10:00:00.000Z"),
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.test/mail");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(calls[0].init.headers, {
      "Content-Type": "application/json",
      "x-webhook-secret": "secret",
    });

    const payload = JSON.parse(String(calls[0].init.body));
    assert.equal(payload.to, "info@devreemakelaardij.nl");
    assert.equal(payload.subject, "Bezichtiging bevestigd: Raaigras 6, 3206 JK Spijkenisse");
    assert.match(payload.html, /Vincent Jansen/);
    assert.match(payload.html, /Open woning op website/);
  } finally {
    process.env.AI_INFO_EMAIL_WEBHOOK_URL = oldWebhookUrl;
    process.env.N8N_WEBHOOK_SECRET = oldWebhookSecret;
    globalThis.fetch = oldFetch;
  }
});
