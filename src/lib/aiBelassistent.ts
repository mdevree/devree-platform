import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addContactPoints,
  addMauticNote,
  addMauticTags,
  getContactFull,
} from "@/lib/mautic";
import { fetchWoningVanWordPress } from "@/lib/wordpress";
import { sendWhatsAppMessage, WhatsAppError } from "@/lib/whatsapp";

const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

type JsonRecord = Record<string, unknown>;

const SERVICE_LINKS = [
  {
    title: "Actueel woningaanbod",
    url: "https://www.devreemakelaardij.nl/aanbod/",
    type: "aanbod",
    intents: ["aanbod", "woning_bekijken", "zoeken"],
    aiDescription: "Gebruik deze link als iemand actueel aanbod wil bekijken.",
    whatsappTemplate:
      "Zoals besproken vindt u hier ons actuele woningaanbod: https://www.devreemakelaardij.nl/aanbod/",
  },
  {
    title: "Woning verkopen",
    url: "https://www.devreemakelaardij.nl/verkoop/",
    type: "dienst",
    intents: ["verkoop", "waardebepaling", "eigen_woning"],
    aiDescription: "Gebruik deze link bij interesse in verkoop of waarde-inschatting.",
    whatsappTemplate:
      "Zoals besproken vindt u hier meer over onze verkoopaanpak: https://www.devreemakelaardij.nl/verkoop/",
  },
  {
    title: "Woning kopen",
    url: "https://www.devreemakelaardij.nl/aankoop/",
    type: "dienst",
    intents: ["aankoop", "bieden", "zoeker", "aankoopbegeleiding"],
    aiDescription: "Gebruik deze link bij vragen over aankoopbegeleiding of bieden.",
    whatsappTemplate:
      "Zoals besproken vindt u hier meer over onze aankoopbegeleiding: https://www.devreemakelaardij.nl/aankoop/",
  },
  {
    title: "Taxatie",
    url: "https://www.devreemakelaardij.nl/taxatie/",
    type: "dienst",
    intents: ["taxatie", "hypotheek", "financiering", "rapport"],
    aiDescription: "Gebruik deze link bij vragen over taxatie of financiering.",
    whatsappTemplate:
      "Zoals besproken vindt u hier meer over taxaties via De Vree Makelaardij: https://www.devreemakelaardij.nl/taxatie/",
  },
  {
    title: "Afspraak plannen",
    url: "https://www.devreemakelaardij.nl/afspraak-plannen/",
    type: "afspraak",
    intents: ["afspraak", "terugbellen", "kennismaking"],
    aiDescription: "Gebruik deze link als iemand zelf een afspraak wil plannen.",
    whatsappTemplate:
      "Zoals besproken kunt u hier zelf een afspraak plannen: https://www.devreemakelaardij.nl/afspraak-plannen/",
  },
];

function stripHtml(input: string | null | undefined) {
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function activeWoningStatus(acf: JsonRecord) {
  const status = String(acf.status || acf.woning_status || acf.object_status || "").toLowerCase();
  return status.includes("te koop") || status.includes("beschikbaar") || status === "actief";
}

async function fetchWpCollection(path: string) {
  const url = new URL(`${WP_BASE_URL}/${path}`);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("_fields", "id,slug,link,title,acf,status");
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  } as RequestInit);
  if (!response.ok) {
    throw new Error(`WordPress ${path} fout: ${response.status}`);
  }
  return response.json() as Promise<JsonRecord[]>;
}

export async function seedManualAiLinks() {
  const now = new Date();
  for (const link of SERVICE_LINKS) {
    const existing = await prisma.aiLinkCatalogItem.findFirst({
      where: { source: "manual", url: link.url },
    });
    const data = {
      title: link.title,
      url: link.url,
      type: link.type,
      source: "manual",
      language: "nl",
      intents: link.intents,
      active: true,
      aiDescription: link.aiDescription,
      whatsappTemplate: link.whatsappTemplate,
      lastSyncedAt: now,
    };
    if (existing) {
      await prisma.aiLinkCatalogItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.aiLinkCatalogItem.create({ data });
    }
  }
}

export async function syncAiLinkCatalog() {
  await seedManualAiLinks();
  const now = new Date();
  let woningCount = 0;
  let faqCount = 0;

  const woningen = await fetchWpCollection("woning");
  for (const item of woningen) {
    const acf = (item.acf || {}) as JsonRecord;
    if (!activeWoningStatus(acf)) continue;
    woningCount += 1;
    await prisma.aiLinkCatalogItem.upsert({
      where: { type_wordpressId: { type: "woning", wordpressId: Number(item.id) } },
      create: {
        title: stripHtml((item.title as JsonRecord | undefined)?.rendered as string) || String(item.slug),
        url: String(item.link || ""),
        type: "woning",
        source: "wordpress",
        language: "nl",
        intents: ["woning_bekijken", "bezichtiging", "aanbod"],
        active: true,
        wordpressId: Number(item.id),
        wordpressSlug: String(item.slug || ""),
        wordpressStatus: String(acf.status || item.status || ""),
        aiDescription: "Actuele woningpagina voor een te koop staande woning.",
        whatsappTemplate: `Zoals besproken vindt u hier de woningpagina: ${String(item.link || "")}`,
        lastSyncedAt: now,
      },
      update: {
        title: stripHtml((item.title as JsonRecord | undefined)?.rendered as string) || String(item.slug),
        url: String(item.link || ""),
        source: "wordpress",
        language: "nl",
        intents: ["woning_bekijken", "bezichtiging", "aanbod"],
        active: true,
        wordpressSlug: String(item.slug || ""),
        wordpressStatus: String(acf.status || item.status || ""),
        aiDescription: "Actuele woningpagina voor een te koop staande woning.",
        whatsappTemplate: `Zoals besproken vindt u hier de woningpagina: ${String(item.link || "")}`,
        lastSyncedAt: now,
      },
    });
  }

  const faqs = await fetchWpCollection("faq");
  for (const item of faqs) {
    faqCount += 1;
    const title = stripHtml((item.title as JsonRecord | undefined)?.rendered as string) || String(item.slug);
    await prisma.aiLinkCatalogItem.upsert({
      where: { type_wordpressId: { type: "faq", wordpressId: Number(item.id) } },
      create: {
        title,
        url: String(item.link || ""),
        type: "faq",
        source: "wordpress",
        language: "nl",
        intents: inferFaqIntents(title),
        active: true,
        wordpressId: Number(item.id),
        wordpressSlug: String(item.slug || ""),
        wordpressStatus: String(item.status || "publish"),
        aiDescription: `Gebruik bij klantvragen over: ${title}`,
        whatsappTemplate: `Zoals besproken vindt u hier onze uitleg: ${String(item.link || "")}`,
        lastSyncedAt: now,
      },
      update: {
        title,
        url: String(item.link || ""),
        intents: inferFaqIntents(title),
        active: true,
        wordpressSlug: String(item.slug || ""),
        wordpressStatus: String(item.status || "publish"),
        aiDescription: `Gebruik bij klantvragen over: ${title}`,
        whatsappTemplate: `Zoals besproken vindt u hier onze uitleg: ${String(item.link || "")}`,
        lastSyncedAt: now,
      },
    });
  }

  return { woningCount, faqCount, manualCount: SERVICE_LINKS.length };
}

function inferFaqIntents(title: string) {
  const lower = title.toLowerCase();
  const intents = ["vraag"];
  if (lower.includes("taxatie") || lower.includes("taxatierapport")) intents.push("taxatie");
  if (lower.includes("waarde") || lower.includes("waardebepaling")) intents.push("waardebepaling");
  if (lower.includes("vraagprijs")) intents.push("verkoop", "vraagprijs");
  if (lower.includes("makelaar") || lower.includes("tarief")) intents.push("verkoop");
  if (lower.includes("bied") || lower.includes("inschrijving")) intents.push("bieden", "aankoop");
  if (lower.includes("vve") || lower.includes("appartement") || lower.includes("mjop")) intents.push("vve");
  return [...new Set(intents)];
}

function buildScriptPreview(input: {
  contactName: string;
  propertyTitle: string;
  viewingDate?: Date | null;
  contactContext: JsonRecord;
  links: { title: string; url: string; type: string; intents: unknown }[];
}) {
  const dateLabel = input.viewingDate
    ? input.viewingDate.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })
    : "onlangs";
  const signals = [
    input.contactContext["kijkerEigenWoning"] ? "heeft mogelijk een eigen woning" : null,
    input.contactContext["kijkerOverwegtVerkoop"] ? "overweegt verkoop" : null,
    input.contactContext["kijkerHypotheekStatus"]
      ? `hypotheekstatus: ${input.contactContext["kijkerHypotheekStatus"]}`
      : null,
    input.contactContext["aiHousingMotivation"]
      ? `woonmotivatie: ${input.contactContext["aiHousingMotivation"]}`
      : null,
  ].filter(Boolean);

  return [
    `Opening: Goedemiddag ${input.contactName || "mevrouw/meneer"}, u spreekt met de digitale assistent van De Vree Makelaardij. Ik bel kort omdat u ${dateLabel} ${input.propertyTitle} heeft bekeken. Heeft u een minuutje?`,
    "",
    "Vragen: algemene indruk, interesse ja/nee/misschien, concrete twijfels, vragen, gewenste vervolgstap.",
    "Bij relevante signalen zacht aanbieden: terugbelverzoek, woninglink, afspraaklink, verkoop/aankoop/taxatie-informatie.",
    "Afronden: maximaal vier korte punten samenvatten, vragen 'Klopt dit zo?', correctie verwerken en doorzetten naar collega.",
    signals.length ? `Bekende signalen: ${signals.join("; ")}.` : "",
    input.links.length
      ? `Beschikbare links: ${input.links.map((link) => `${link.title} (${link.type})`).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createAiCallJobFromAgenda(agendaAfspraakId: string) {
  const afspraak = await prisma.agendaAfspraak.findUnique({
    where: { id: agendaAfspraakId },
    include: {
      project: true,
      lead: true,
    },
  });
  if (!afspraak) throw new Error("Afspraak niet gevonden");

  let mauticContact = null;
  if (afspraak.mauticContactId) {
    mauticContact = await getContactFull(afspraak.mauticContactId).catch(() => null);
  }

  const woning = afspraak.project?.realworksId
    ? await fetchWoningVanWordPress(afspraak.project.realworksId)
    : null;
  const serviceLinks = await prisma.aiLinkCatalogItem.findMany({
    where: {
      active: true,
      OR: [
        { type: { in: ["dienst", "afspraak", "aanbod"] } },
        woning?.wpId ? { wordpressId: woning.wpId, type: "woning" } : { id: "__never__" },
      ],
    },
    take: 8,
    orderBy: [{ type: "asc" }, { title: "asc" }],
  });

  const mauticName = [mauticContact?.firstname, mauticContact?.lastname].filter(Boolean).join(" ").trim();
  const contactName = afspraak.contactNaam || mauticName || afspraak.lead?.naam || "Onbekende kijker";
  const contactPhone = afspraak.contactTelefoon || mauticContact?.mobile || mauticContact?.phone || afspraak.lead?.telefoon || null;
  const contactEmail = afspraak.contactEmail || mauticContact?.email || afspraak.lead?.email || null;
  const propertyTitle =
    woning?.titel ||
    afspraak.project?.woningAdres ||
    afspraak.project?.name ||
    afspraak.aglocation ||
    "de woning";
  const propertyAddress =
    afspraak.project?.woningAdres ||
    [woning?.acf?.straat, woning?.acf?.huisnummer, woning?.acf?.plaats].filter(Boolean).join(" ") ||
    null;

  const context = {
    source: "bezichtiging",
    agendaAfspraakId,
    viewingDate: afspraak.agbegin?.toISOString() || null,
    contact: {
      name: contactName,
      phone: contactPhone,
      email: contactEmail,
      mauticContactId: afspraak.mauticContactId,
      language: "nl",
    },
    property: {
      title: propertyTitle,
      address: propertyAddress,
      url: woning?.link || null,
      realworksId: afspraak.project?.realworksId || null,
      details: woning?.acf || null,
    },
    signals: {
      aiCurrentSituation: mauticContact?.aiCurrentSituation,
      aiHousingMotivation: mauticContact?.aiHousingMotivation,
      aiBudgetIndication: mauticContact?.aiBudgetIndication,
      aiTimeline: mauticContact?.aiTimeline,
      kijkerEigenWoning: mauticContact?.kijkerEigenWoning,
      kijkerOverwegtVerkoop: mauticContact?.kijkerOverwegtVerkoop,
      kijkerHypotheekStatus: mauticContact?.kijkerHypotheekStatus,
      bezichtigingNotities: mauticContact?.bezichtigingNotities,
    },
    allowedLinks: serviceLinks.map((link) => ({
      id: link.id,
      title: link.title,
      url: link.url,
      type: link.type,
      intents: link.intents,
    })),
  };

  return prisma.aiCallJob.create({
    data: {
      source: "bezichtiging",
      agendaAfspraakId,
      projectId: afspraak.projectId,
      mauticContactId: afspraak.mauticContactId,
      leadId: afspraak.leadId,
      contactName: contactName || null,
      contactPhone,
      contactEmail,
      language: "nl",
      propertyTitle,
      propertyAddress,
      propertyUrl: woning?.link || null,
      viewingDate: afspraak.agbegin,
      context,
      scriptPreview: buildScriptPreview({
        contactName,
        propertyTitle,
        viewingDate: afspraak.agbegin,
        contactContext: (context.signals || {}) as JsonRecord,
        links: context.allowedLinks,
      }),
      status: contactPhone ? "ready" : "draft",
    },
  });
}

export async function writeAiCallResultToMautic(resultId: string) {
  const result = await prisma.aiCallResult.findUnique({ where: { id: resultId } });
  if (!result) throw new Error("Callresultaat niet gevonden");
  const job = await prisma.aiCallJob.findUnique({ where: { id: result.aiCallJobId } });
  if (!job?.mauticContactId) return null;

  const note = [
    "AI-belopvolging bezichtiging",
    "",
    `Samenvatting:\n${result.summary}`,
    result.transcript ? `\nTranscript:\n${result.transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await addMauticNote(job.mauticContactId, note);
  await addMauticTags(job.mauticContactId, buildMauticTags(result));
  await addContactPoints(job.mauticContactId, result.outcome === "answered" ? 8 : 2);

  return prisma.aiCallResult.update({
    where: { id: result.id },
    data: { mauticWrittenAt: new Date() },
  });
}

export async function queueInfoEmailForCallResult(resultId: string) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return null;

  const result = await prisma.aiCallResult.findUnique({ where: { id: resultId } });
  if (!result) throw new Error("Callresultaat niet gevonden");
  const job = await prisma.aiCallJob.findUnique({ where: { id: result.aiCallJobId } });
  if (!job) throw new Error("Belkaart niet gevonden");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject: `AI-belgesprek: ${job.contactName || "onbekende kijker"}${job.propertyTitle ? ` - ${job.propertyTitle}` : ""}`,
      job,
      result,
    }),
  });

  if (!response.ok) {
    throw new Error(`Info-mail webhook mislukt: ${response.status}`);
  }

  const webhookResult = await response.json().catch(() => null);
  if (!webhookResult || webhookResult.queued !== true) {
    throw new Error("Info-mail webhook gaf geen queued=true terug");
  }

  return prisma.aiCallResult.update({
    where: { id: resultId },
    data: { infoEmailQueuedAt: new Date() },
  });
}

function buildMauticTags(result: { outcome: string; detectedOpportunities: unknown; requestedFollowUp: unknown; proposedLinks: unknown }) {
  const tags = ["ai_nagebeld", "bezichtiging_followup"];
  if (result.outcome === "voicemail") tags.push("ai_voicemail");
  const opportunities = asArray(result.detectedOpportunities);
  const followUp = JSON.stringify(result.requestedFollowUp || {}).toLowerCase();
  const links = asArray(result.proposedLinks);
  if (followUp.includes("terugbel")) tags.push("terugbellen");
  if (links.length || followUp.includes("link")) tags.push("link_gewenst");
  if (opportunities.includes("verkoop") || followUp.includes("verkoop")) tags.push("verkoopkans");
  if (opportunities.includes("aankoop") || followUp.includes("aankoop")) tags.push("aankoopkans");
  if (opportunities.includes("taxatie") || followUp.includes("taxatie")) tags.push("taxatiekans");
  return tags;
}

export async function createDraftsFromCallResult(resultId: string) {
  const result = await prisma.aiCallResult.findUnique({ where: { id: resultId } });
  if (!result) throw new Error("Callresultaat niet gevonden");
  const job = await prisma.aiCallJob.findUnique({ where: { id: result.aiCallJobId } });
  if (!job) throw new Error("Belkaart niet gevonden");

  const links = Array.isArray(result.proposedLinks) ? result.proposedLinks as JsonRecord[] : [];
  const drafts = [];
  for (const link of links) {
    const url = String(link.url || "");
    if (!url) continue;
    const title = String(link.title || "de besproken link");
    drafts.push(
      await prisma.followUpDraft.create({
        data: {
          channel: "whatsapp",
          purpose: String(link.purpose || link.type || "faq"),
          aiCallJobId: job.id,
          aiCallResultId: result.id,
          mauticContactId: job.mauticContactId,
          projectId: job.projectId,
          recipientName: job.contactName,
          recipientPhone: job.contactPhone,
          recipientEmail: job.contactEmail,
          body: `Goedemiddag${job.contactName ? ` ${job.contactName}` : ""}, zoals besproken vindt u hier ${title}: ${url}\n\nMet vriendelijke groet,\nDe Vree Makelaardij`,
          links: [link] as Prisma.InputJsonValue,
          status: "draft",
          createdBy: "ai",
        },
      })
    );
  }
  return drafts;
}

export async function sendFollowUpDraft(id: string, reviewedBy?: string | null) {
  const draft = await prisma.followUpDraft.findUnique({ where: { id } });
  if (!draft) throw new Error("Concept niet gevonden");
  if (draft.channel !== "whatsapp") throw new Error("Alleen WhatsApp verzenden is nu ondersteund");
  if (!draft.recipientPhone) throw new Error("Geen telefoonnummer op concept");

  const conversation = await openWhatsAppConversationForDraft(draft);
  try {
    const evolutionMsgId = await sendWhatsAppMessage(conversation.waPhone, draft.body);
    const message = await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        body: draft.body,
        deliveryStatus: "SENT",
        evolutionMsgId,
      },
    });
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: "OPEN" },
    });
    return prisma.followUpDraft.update({
      where: { id },
      data: {
        status: "sent",
        reviewedBy: reviewedBy || draft.reviewedBy,
        reviewedAt: draft.reviewedAt || new Date(),
        sentAt: new Date(),
        waConversationId: conversation.id,
        waMessageId: message.id,
        deliveryError: null,
      },
    });
  } catch (error) {
    const detail =
      error instanceof WhatsAppError && error.detail
        ? error.detail
        : error instanceof Error
          ? error.message
          : String(error);
    return prisma.followUpDraft.update({
      where: { id },
      data: { status: "failed", deliveryError: detail },
    });
  }
}

function toStorageJid(phone: string) {
  const digits = phone.trim().replace(/\D/g, "");
  if (!digits) return null;
  let international = digits;
  if (digits.startsWith("00")) international = digits.slice(2);
  else if (digits.startsWith("0")) international = `31${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith("6")) international = `31${digits}`;
  if (international.length < 10) return null;
  return `${international}@s.whatsapp.net`;
}

async function openWhatsAppConversationForDraft(draft: { recipientPhone: string | null; recipientName: string | null; mauticContactId: number | null }) {
  const waPhone = draft.recipientPhone ? toStorageJid(draft.recipientPhone) : null;
  if (!waPhone) throw new Error("Geen geldig WhatsApp-nummer");
  const existing = await prisma.waConversation.findFirst({ where: { waPhone } });
  if (existing) {
    return prisma.waConversation.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        waName: existing.waName || draft.recipientName,
        mauticContactId: existing.mauticContactId ?? draft.mauticContactId,
      },
    });
  }
  return prisma.waConversation.create({
    data: {
      waPhone,
      waName: draft.recipientName,
      mauticContactId: draft.mauticContactId,
      status: "OPEN",
    },
  });
}
