import type { Prisma } from "@prisma/client";
import { reviewEmail } from "@/lib/listingSearch";

export const officeFollowupInclude = {
  housingDelivery: { include: { rule: { select: { mode: true, state: true } }, event: { select: { address: true } } } },
} as const;

export type OfficeFollowup = Prisma.FollowUpDraftGetPayload<{ include: typeof officeFollowupInclude }>;

const openStatuses = ["draft", "approved", "failed"];

export const officeFollowupOpenWhere: Prisma.FollowUpDraftWhereInput = {
  channel: "whatsapp",
  sentAt: null,
  status: { in: [...openStatuses, "sending", "uncertain"] },
  OR: [
    { housingDelivery: null },
    { housingDelivery: { is: { rule: { mode: "draft" } } } },
  ],
};

export function canAccessOfficeFollowup(purpose: string, email: string) {
  return purpose !== "zoekmelding" || email.toLowerCase() === reviewEmail;
}

export function canEditOfficeFollowup(draft: OfficeFollowup) {
  return draft.channel === "whatsapp" && !draft.sentAt && openStatuses.includes(draft.status) &&
    (!draft.housingDelivery || (draft.housingDelivery.state === "ready" &&
      draft.housingDelivery.rule.mode === "draft" && draft.housingDelivery.rule.state === "active"));
}

export function officeFollowupSummary(draft: OfficeFollowup) {
  const address = draft.housingDelivery?.event.address;
  switch (draft.purpose) {
    case "zoekmelding": return address ? `Nieuwe woning die past bij de zoekopdracht: ${address}` : "Nieuwe woning die past bij de zoekopdracht";
    case "woningmelding": return address ? `Update over ${address}` : "Update over een woning";
    case "bezichtiging_followup": return "Opvolging na een bezichtiging";
    case "afspraak_link": return "Bevestiging van een afspraak";
    case "woning_link": return "Link naar een woning";
    case "terugbelverzoek": return "Opvolging na een terugbelverzoek";
    case "taxatie": return "Opvolging over een taxatie";
    case "verkoop": return "Opvolging over verkoop";
    case "aankoop": return "Opvolging over aankoop";
    default: return draft.subject?.trim() || "WhatsApp-opvolging";
  }
}
