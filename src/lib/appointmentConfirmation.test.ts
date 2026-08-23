import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentTokenHash,
  buildAppointmentWhatsappBody,
  createAppointmentToken,
  isValidAppointmentPreview,
  publicAppointmentPreviewUrl,
} from "./appointmentConfirmation";

test("maakt veilige afspraak tokens en hashes", () => {
  const token = createAppointmentToken();
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(appointmentTokenHash(token).length, 64);
  assert.notEqual(appointmentTokenHash(token), token);
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
    name: "Vincent Jansen",
    woningAdres: "Raaigras 6, Spijkenisse",
    appointmentStart: new Date("2026-08-27T13:00:00.000Z"),
    publicUrl: "https://www.devreemakelaardij.nl/afspraak/abc",
  });

  assert.match(body, /Goedemiddag Vincent/);
  assert.match(body, /Raaigras 6, Spijkenisse/);
  assert.match(body, /https:\/\/www\.devreemakelaardij\.nl\/afspraak\/abc/);
  assert.match(body, /Komt de afspraak toch niet uit/);
});
