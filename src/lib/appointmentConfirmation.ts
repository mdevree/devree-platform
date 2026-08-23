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
  const url = new URL(platformAppointmentUrl(token));
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
  name?: string | null;
  woningTitle?: string | null;
  woningAdres?: string | null;
  appointmentStart?: Date | null;
  publicUrl: string;
}) {
  const firstName = input.name?.trim().split(/\s+/)[0] || null;
  const greeting = firstName ? `Goedemiddag ${firstName}` : "Goedemiddag";
  const woning = input.woningAdres || input.woningTitle || "de woning";
  const dateLabel = formatAppointmentDateTime(input.appointmentStart);
  const appointmentLine = dateLabel
    ? `De afspraak staat gepland op ${dateLabel}.`
    : "De afspraak staat gepland zoals afgesproken.";

  return [
    `${greeting}, hierbij de bevestiging van uw bezichtiging bij ${woning}.`,
    `Ik heb een korte video voor u opgenomen: ${input.publicUrl}`,
    appointmentLine,
    "Komt de afspraak toch niet uit, dan kunt u dat via de link eenvoudig aan ons doorgeven.",
    "",
    "Met vriendelijke groet,",
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
