import crypto from "crypto";
import path from "path";
import { AppointmentConfirmation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addContactPoints, addMauticTags } from "@/lib/mautic";

const PREVIEW_MAX_AGE_MS = 1000 * 60 * 60 * 8;

export const APPOINTMENT_EVENT_TYPES = new Set([
  "page_open",
  "video_start",
  "video_progress_25",
  "video_progress_75",
  "video_complete",
  "confirm_click",
  "cancel_click",
  "woning_click",
  "route_click",
  "calendar_click",
]);

export function createAppointmentToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function appointmentTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicBaseUrl() {
  return (
    process.env.APPOINTMENT_PUBLIC_BASE_URL ||
    "https://www.devreemakelaardij.nl"
  ).replace(/\/$/, "");
}

function platformBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_PLATFORM_URL ||
    process.env.PLATFORM_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    publicBaseUrl()
  ).replace(/\/$/, "");
}

export function publicAppointmentUrl(token: string) {
  return `${publicBaseUrl()}/afspraak/${encodeURIComponent(token)}`;
}

export function appointmentTokenFromPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const match = new URL(value).pathname.match(/^\/afspraak\/([A-Za-z0-9_-]+)\/?$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function platformAppointmentUrl(token: string) {
  return `${platformBaseUrl()}/afspraak/${encodeURIComponent(token)}`;
}

function previewSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.N8N_WEBHOOK_SECRET || "devree-platform-preview";
}

function previewSignature(token: string, previewUntil: number) {
  return crypto
    .createHmac("sha256", previewSecret())
    .update(`${token}:${previewUntil}`)
    .digest("base64url");
}

export function publicAppointmentPreviewUrl(token: string, now = Date.now()) {
  const previewUntil = now + PREVIEW_MAX_AGE_MS;
  const url = new URL(publicAppointmentUrl(token));
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewUntil", String(previewUntil));
  url.searchParams.set("previewSig", previewSignature(token, previewUntil));
  return url.toString();
}

export function isValidAppointmentPreview(
  token: string,
  previewUntil: string | undefined,
  previewSig: string | undefined,
  now = Date.now()
) {
  const until = Number(previewUntil);
  if (!Number.isFinite(until) || until < now) return false;
  if (until - now > PREVIEW_MAX_AGE_MS + 1000 * 60) return false;
  if (!previewSig) return false;

  const expected = previewSignature(token, until);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(previewSig);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function appointmentVideoUploadDir() {
  return process.env.APPOINTMENT_VIDEO_UPLOAD_DIR || path.join(process.cwd(), "uploads", "appointment-videos");
}

export function appointmentVideoPath(filename: string) {
  return path.join(appointmentVideoUploadDir(), filename);
}

export function formatAppointmentDateTime(date: Date | null | undefined) {
  if (!date) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatIcalDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcalText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildAppointmentCalendar(input: {
  id: string;
  address: string;
  start: Date;
  end?: Date | null;
  publicUrl?: string | null;
  woningUrl?: string | null;
  now?: Date;
}) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.address)}`;
  const description = [
    "Uw bezichtiging met De Vree Makelaardij.",
    input.woningUrl ? `Woning: ${input.woningUrl}` : null,
    `Route: ${mapsUrl}`,
    "Vragen? Bel 0181 - 611 919 of mail info@devreemakelaardij.nl.",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//De Vree Makelaardij//Bezichtiging//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:afspraak-${input.id}@devreemakelaardij.nl`,
    `DTSTAMP:${formatIcalDate(input.now || new Date())}`,
    `DTSTART:${formatIcalDate(input.start)}`,
    ...(input.end ? [`DTEND:${formatIcalDate(input.end)}`] : []),
    `SUMMARY:${escapeIcalText(`Bezichtiging ${input.address}`)}`,
    `LOCATION:${escapeIcalText(input.address)}`,
    `DESCRIPTION:${escapeIcalText(description)}`,
    ...(input.publicUrl ? [`URL:${input.publicUrl}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNotificationDateTime(date: Date | null | undefined) {
  if (!date) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function appointmentObjectLabel(confirmation: AppointmentConfirmation) {
  return confirmation.woningAdres || confirmation.woningTitle || "Onbekende woning";
}

export async function notifyOfficeAppointmentAction({
  confirmation,
  action,
  actionAt,
}: {
  confirmation: AppointmentConfirmation;
  action: "confirmed" | "cancel_requested";
  actionAt: Date;
}) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  const objectLabel = appointmentObjectLabel(confirmation);
  const actionLabel = action === "confirmed" ? "Bevestigd" : "Annulering aangevraagd";
  const subject =
    action === "confirmed"
      ? `Bezichtiging bevestigd: ${objectLabel}`
      : `Annulering bezichtiging aangevraagd: ${objectLabel}`;
  const appointmentLabel = formatAppointmentDateTime(confirmation.appointmentStart) || "Onbekend";
  const actionAtLabel = formatNotificationDateTime(actionAt) || "";

  const html = `
    <h2>${escapeHtml(actionLabel)}</h2>
    <p>Er is een actie uitgevoerd op de afspraakbevestigingspagina.</p>
    <p>
      <strong>Woning:</strong> ${escapeHtml(objectLabel)}<br>
      <strong>Afspraak:</strong> ${escapeHtml(appointmentLabel)}<br>
      <strong>Actie:</strong> ${escapeHtml(actionLabel)}<br>
      <strong>Actietijd:</strong> ${escapeHtml(actionAtLabel)}
    </p>
    <p>
      <strong>Naam:</strong> ${escapeHtml(confirmation.recipientName || "Onbekend")}<br>
      <strong>E-mail:</strong> ${escapeHtml(confirmation.recipientEmail || "")}<br>
      <strong>Telefoon:</strong> ${escapeHtml(confirmation.recipientPhone || "")}
    </p>
    <p>
      ${confirmation.publicUrl ? `<a href="${escapeHtml(confirmation.publicUrl)}">Open afspraakpagina</a><br>` : ""}
      ${confirmation.woningUrl ? `<a href="${escapeHtml(confirmation.woningUrl)}">Open woning op website</a>` : ""}
    </p>
  `;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject,
      html,
    }),
  }).catch((error) => {
    console.error("Afspraakbevestiging notificatiemail mislukt:", error);
  });
}

export function buildAppointmentWhatsappBody(input: {
  woningTitle?: string | null;
  woningAdres?: string | null;
  appointmentStart?: Date | null;
  medewerker?: string | null;
  publicUrl: string;
}) {
  const address = input.woningAdres?.trim();
  const addressParts = address?.match(/^(.+?),\s*\d{4}\s*[A-Z]{2},?\s*(.+)$/i);
  const plaats = addressParts?.[2]
    ?.toLocaleLowerCase("nl-NL")
    .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("nl-NL"));
  const woning = addressParts
    ? `${addressParts[1]} in ${plaats}`
    : input.woningTitle || address || "de woning";
  const afspraak = input.appointmentStart
    ? {
        dag: new Intl.DateTimeFormat("nl-NL", {
          timeZone: "Europe/Amsterdam",
          weekday: "long",
        }).format(input.appointmentStart),
        tijd: new Intl.DateTimeFormat("nl-NL", {
          timeZone: "Europe/Amsterdam",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(input.appointmentStart)
          .replace(":", "."),
      }
    : null;
  const medewerker = input.medewerker?.trim() || null;

  return [
    "Goedemiddag,",
    "",
    afspraak
      ? `Aanstaande ${afspraak.dag} hebben wij een afspraak voor de bezichtiging van ${woning}.`
      : `Binnenkort hebben wij een afspraak voor de bezichtiging van ${woning}.`,
    "",
    "Ik heb een korte video voor u opgenomen:",
    input.publicUrl,
    "",
    afspraak
      ? `Mocht de afspraak toch niet uitkomen, dan kunt u dit eenvoudig via deze pagina aan ons doorgeven. Anders zie ik u ${afspraak.dag} om ${afspraak.tijd} uur bij de woning.`
      : "Mocht de afspraak toch niet uitkomen, dan kunt u dit eenvoudig via deze pagina aan ons doorgeven. Anders zie ik u op het afgesproken tijdstip bij de woning.",
    "",
    "Met vriendelijke groet,",
    "",
    ...(medewerker ? [medewerker] : []),
    "De Vree Makelaardij",
  ].join("\n");
}

function pointsForEvent(eventType: string) {
  if (eventType === "page_open") return 1;
  if (eventType === "video_progress_75" || eventType === "video_complete") return 2;
  if (eventType === "confirm_click") return 3;
  if (eventType === "woning_click") return 1;
  return 0;
}

function tagsForEvent(eventType: string) {
  if (eventType === "page_open") return ["bezichtiging_bevestiging_geopend"];
  if (eventType === "video_progress_75" || eventType === "video_complete") return ["bezichtiging_video_bekeken"];
  if (eventType === "confirm_click") return ["bezichtiging_bevestigd"];
  if (eventType === "cancel_click") return ["bezichtiging_annulering_aangevraagd"];
  if (eventType === "woning_click") return ["bezichtiging_woning_geklikt"];
  return [];
}

export async function recordAppointmentEvent(input: {
  confirmationId: string;
  mauticContactId?: number | null;
  eventType: string;
  sessionId?: string | null;
  activeSeconds?: number | null;
  path?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  viewport?: string | null;
  clickedUrl?: string | null;
  rawPayload?: Prisma.InputJsonValue;
}) {
  const now = new Date();
  await prisma.appointmentConfirmationEvent.create({
    data: {
      confirmationId: input.confirmationId,
      eventType: input.eventType,
      sessionId: input.sessionId ?? null,
      activeSeconds: input.activeSeconds ?? null,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      userAgent: input.userAgent ?? null,
      ipHash: input.ipHash ?? null,
      viewport: input.viewport ?? null,
    },
  });

  const update: Prisma.AppointmentConfirmationUpdateInput = {};
  if (input.eventType === "page_open") {
    update.openedAt = now;
    update.lastOpenedAt = now;
    update.openCount = { increment: 1 };
  }
  if (input.eventType === "video_start") {
    update.videoStartedAt = now;
    update.videoStartCount = { increment: 1 };
  }
  if (input.eventType === "video_complete") {
    update.videoCompletedAt = now;
    update.videoCompleteCount = { increment: 1 };
  }
  if (Object.keys(update).length) {
    await prisma.appointmentConfirmation.update({
      where: { id: input.confirmationId },
      data: update,
    });
  }

  if (input.mauticContactId) {
    await prisma.mauticEvent.create({
      data: {
        mauticContactId: input.mauticContactId,
        eventType: `appointment.${input.eventType}`,
        clickedUrl: input.clickedUrl ?? input.path ?? null,
        occurredAt: now,
        rawPayload: input.rawPayload ?? Prisma.JsonNull,
      },
    }).catch((error) => console.error("Afspraak-event lokaal naar MauticEvent schrijven mislukt:", error));

    const points = pointsForEvent(input.eventType);
    if (points > 0) {
      addContactPoints(input.mauticContactId, points).catch((error) =>
        console.error("Mautic punten afspraakbevestiging mislukt:", error)
      );
    }

    const tags = tagsForEvent(input.eventType);
    if (tags.length) {
      addMauticTags(input.mauticContactId, tags).catch((error) =>
        console.error("Mautic tags afspraakbevestiging mislukt:", error)
      );
    }
  }
}
