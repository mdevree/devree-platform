import type { WaReplyDraft } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { FollowUpDraftConflict, sendFollowUpDraft } from "@/lib/aiBelassistent";
import { isWhatsAppDraftId } from "@/lib/whatsappDraftLinks";
import { sameWhatsAppMobileOrigin, whatsappMobileActor, type WhatsAppMobileActor } from "@/lib/whatsappMobileAccess";
import { canAccessOfficeFollowup, canEditOfficeFollowup, officeFollowupInclude, officeFollowupOpenWhere, officeFollowupSummary, type OfficeFollowup } from "@/lib/whatsappOfficeFollowup";
import { editWhatsAppReplyDraft, listWhatsAppReplyDraftMessages, sendWhatsAppReplyDraft, WhatsAppReplyError } from "@/lib/whatsappReplies";
import { prisma } from "@/lib/prisma";

const limit = 150;

function response(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function replyView(draft: WaReplyDraft, messages: { body: string | null; receivedAt: Date }[] = []) {
  const open = ((draft.status === "ready" || draft.status === "failed") && !!draft.body);
  const state = open || (draft.status === "pending" && !!draft.body) ? "open"
    : draft.status === "sent" ? "sent"
    : ["uncertain", "sending"].includes(draft.status) ? "uncertain"
    : draft.status === "answered" ? "answered" : "closed";
  return {
    id: `reply-${draft.id}`, account: draft.account, kind: "reply",
    recipientName: draft.recipientName || "WhatsApp-contact",
    summary: draft.summary || "Antwoord op een WhatsApp-bericht",
    body: state === "open" ? draft.body : null,
    state, version: String(draft.revision),
    canEdit: state === "open", canSend: open, updatedAt: draft.updatedAt.toISOString(),
    messages: messages.flatMap(({ body, receivedAt }) => body ? [{ body, at: receivedAt.toISOString() }] : []),
  };
}

function followupView(draft: OfficeFollowup) {
  const canEdit = canEditOfficeFollowup(draft);
  const state = draft.sentAt || draft.status === "sent" ? "sent"
    : ["uncertain", "sending"].includes(draft.status) || ["uncertain", "sending"].includes(draft.housingDelivery?.state || "") ? "uncertain"
    : canEdit ? "open" : "closed";
  return {
    id: `followup-${draft.id}`, account: "office", kind: "followup",
    recipientName: draft.recipientName || "WhatsApp-contact",
    summary: officeFollowupSummary(draft), body: canEdit ? draft.body : null, state,
    version: draft.updatedAt.toISOString(), canEdit, canSend: canEdit && !!draft.recipientPhone,
    updatedAt: draft.updatedAt.toISOString(), messages: [],
  };
}

function accountWhere(actor: WhatsAppMobileActor) {
  return [
    ...(process.env.WHATSAPP_REPLY_OFFICE_ENABLED === "1" ? [{ account: "office", ownerUserId: null }] : []),
    ...(actor.personal ? [{ account: "personal", ownerUserId: actor.id }] : []),
  ];
}

async function findFollowup(id: string, actor: WhatsAppMobileActor) {
  const draft = await prisma.followUpDraft.findFirst({
    where: { id, channel: "whatsapp" }, include: officeFollowupInclude,
  });
  return draft && canAccessOfficeFollowup(draft.purpose, actor.email) ? draft : null;
}

export async function GET(req: NextRequest) {
  const actor = await whatsappMobileActor();
  if (!actor) return response({ error: "Log opnieuw in." }, 401);
  const selected = req.nextUrl.searchParams.get("draft");
  if (selected !== null) {
    if (!isWhatsAppDraftId(selected)) return response({ error: "Ongeldig concept." }, 400);
    if (selected.startsWith("reply-")) {
      const draft = await prisma.waReplyDraft.findFirst({ where: { id: selected.slice(6), OR: accountWhere(actor) } });
      if (!draft) return response({ error: "Concept niet gevonden." }, 404);
      const context = ["pending", "ready", "failed"].includes(draft.status) ? await listWhatsAppReplyDraftMessages(draft) : [];
      return response({ draft: replyView(draft, context) });
    }
    const draft = await findFollowup(selected.slice(9), actor);
    return draft ? response({ draft: followupView(draft) }) : response({ error: "Concept niet gevonden." }, 404);
  }

  const [replies, followups] = await Promise.all([
    prisma.waReplyDraft.findMany({
      where: { OR: accountWhere(actor), status: { in: ["pending", "ready", "failed", "sending", "uncertain"] },
        AND: [{ OR: [{ body: { not: null } }, { status: { in: ["sending", "uncertain"] } }] }],
      },
      orderBy: { updatedAt: "desc" }, take: limit + 1,
    }),
    prisma.followUpDraft.findMany({
      where: {
        AND: [officeFollowupOpenWhere, ...(canAccessOfficeFollowup("zoekmelding", actor.email) ? [] : [{ purpose: { not: "zoekmelding" } }])],
      },
      include: officeFollowupInclude,
      orderBy: { updatedAt: "desc" }, take: limit + 1,
    }),
  ]);
  const drafts = [...replies.map((draft) => replyView(draft)), ...followups.map(followupView)]
    .filter(({ state }) => state !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return response({
    drafts: drafts.slice(0, limit).map((draft) => ({ ...draft, body: null })),
    complete: drafts.length <= limit && replies.length <= limit && followups.length <= limit,
    personalAvailable: actor.personal,
  });
}

async function write(req: NextRequest, send: boolean) {
  if (!sameWhatsAppMobileOrigin(req)) return response({ error: "Ongeldige herkomst." }, 403);
  const actor = await whatsappMobileActor();
  if (!actor) return response({ error: "Log opnieuw in." }, 401);
  const data = await req.json().catch(() => null);
  if (!isWhatsAppDraftId(data?.id) || typeof data.version !== "string" ||
      typeof data.body !== "string" || !data.body.trim() || data.body.length > 10000) {
    return response({ error: "Vul een geldige berichttekst in." }, 400);
  }
  const { id, version } = data;
  const body = data.body.trim();

  try {
    if (id.startsWith("reply-")) {
      if (!/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(Number(version))) {
        return response({ error: "Ongeldige conceptversie." }, 400);
      }
      const action = send ? sendWhatsAppReplyDraft : editWhatsAppReplyDraft;
      const draft = await action(id.slice(6), Number(version), body, actor.id);
      const context = ["pending", "ready", "failed"].includes(draft.status) ? await listWhatsAppReplyDraftMessages(draft) : [];
      return response({ draft: replyView(draft, context) });
    }

    const original = await findFollowup(id.slice(9), actor);
    if (!original) return response({ error: "Concept niet gevonden." }, 404);
    if (!canEditOfficeFollowup(original) || original.updatedAt.toISOString() !== version) {
      return response({ error: "Dit concept is inmiddels gewijzigd of verwerkt. Vernieuw het gesprek." }, 409);
    }
    if (send && !original.recipientPhone) return response({ error: "Dit concept heeft geen ontvanger." }, 409);
    const updated = await prisma.followUpDraft.update({
      where: {
        id: original.id, channel: "whatsapp", status: original.status, sentAt: null, updatedAt: original.updatedAt,
        ...(original.housingDelivery ? { housingDelivery: { state: "ready", rule: { mode: "draft", state: "active" } } } : {}),
      },
      include: officeFollowupInclude,
      data: { body, ...(send && { status: "approved", reviewedBy: actor.email, reviewedAt: new Date() }) },
    });
    if (!send) return response({ draft: followupView(updated) });
    try {
      await sendFollowUpDraft(updated.id, actor.email, actor.email, updated.updatedAt);
    } catch (error) {
      if (error instanceof FollowUpDraftConflict || updated.housingDelivery) {
        return response({ error: "Verzenden kon niet worden vrijgegeven. Vernieuw het concept." }, 409);
      }
      throw error;
    }

    const sent = await findFollowup(updated.id, actor);
    return sent ? response({ draft: followupView(sent) }) : response({ error: "Concept niet gevonden." }, 404);
  } catch (error) {
    if (error instanceof WhatsAppReplyError) return response({ error: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return response({ error: "Dit concept is inmiddels gewijzigd of verwerkt. Vernieuw het gesprek." }, 409);
    }
    throw error;
  }
}

export function PATCH(req: NextRequest) { return write(req, false); }
export function POST(req: NextRequest) { return write(req, true); }
