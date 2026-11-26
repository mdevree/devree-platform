import { prisma } from "./prisma";
import { toWhatsAppJid } from "./phone";
import { getContact } from "./mautic";

export const liveAlerts = () => process.env.HOUSING_ALERT_MODE === "live";
export function eligiblePilot(phone: string | null) {
  const pilot = process.env.HOUSING_ALERT_TEST_PHONE;
  return !!pilot && !!phone && toWhatsAppJid(pilot) === toWhatsAppJid(phone);
}
// Both the operator's send button and automatic delivery acquire this same claim.
export async function claimHousingDraft(draftId: string, phone: string, search = false) {
  const match = await prisma.housingAlertDelivery.findUniqueOrThrow({
    where: { draftId },
    include: { rule: true },
  });
  if (!liveAlerts() && !eligiblePilot(phone))
    throw new Error("Meekijkstand is actief");
  const contact = await getContact(match.rule.contactId);
  const currentPhone = contact?.mobile || contact?.phone;
  if (
    !currentPhone ||
    toWhatsAppJid(currentPhone) !== toWhatsAppJid(phone) ||
    toWhatsAppJid(phone) !== toWhatsAppJid(match.rule.phone || "")
  ) {
    await prisma.housingAlertDelivery.updateMany({
      where: { id: match.id, state: "ready" },
      data: { state: "review" },
    });
    throw new Error("Controleer het gewijzigde telefoonnummer");
  }
  const claim = await prisma.housingAlertDelivery.updateMany({
    where: {
      id: match.id,
      state: "ready",
      rule: { state: "active", ...(search ? {kind: "listing", mode: "draft", activeFrom: {lte: match.createdAt}} : {}) },
      draft: { status: { in: search ? ["approved"] : ["draft", "approved"] }, sentAt: null },
    },
    data: { state: "sending", attemptedAt: new Date() },
  });
  if (!claim.count)
    throw new Error("Deze woningmelding is al verwerkt of gepauzeerd");
}
