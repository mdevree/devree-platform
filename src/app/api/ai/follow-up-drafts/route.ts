import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = ["draft", "approved", "failed"];
const URL_PATTERN = /https?:\/\/[^\s<>"')]+/g;

type DraftForActivity = {
  id: string;
  body: string;
  links: unknown;
  mauticContactId: number | null;
  createdAt: Date;
};

function urlsFromDraft(draft: DraftForActivity) {
  const urls = new Set<string>();
  for (const match of draft.body.matchAll(URL_PATTERN)) {
    urls.add(match[0].replace(/[.,;:!?]+$/, ""));
  }

  if (draft.links && typeof draft.links === "object") {
    const values = Object.values(draft.links as Record<string, unknown>);
    for (const value of values) {
      if (typeof value === "string" && value.startsWith("http")) {
        urls.add(value);
      }
    }
  }

  return [...urls];
}

function rcodeFromDraft(draft: DraftForActivity) {
  if (draft.links && typeof draft.links === "object") {
    const value = (draft.links as Record<string, unknown>).agrcode;
    if (value != null) return String(value);
  }
  const match = draft.body.match(/[?&]rcode=([^&\s]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim().replace(/\/$/, "");
  }
}

function eventMatchesDraft(eventUrl: string | null, draft: DraftForActivity) {
  if (!eventUrl) return false;
  const normalizedEventUrl = normalizeUrl(eventUrl);
  const urls = urlsFromDraft(draft).map(normalizeUrl);
  if (urls.some((url) => normalizedEventUrl === url || normalizedEventUrl.startsWith(`${url}?`) || normalizedEventUrl.startsWith(`${url}&`))) {
    return true;
  }

  const rcode = rcodeFromDraft(draft);
  return Boolean(rcode && normalizedEventUrl.includes(`rcode=${encodeURIComponent(rcode)}`));
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);
  const drafts = await prisma.followUpDraft.findMany({
    where:
      status === "alle"
        ? {}
        : status === "active"
        ? { status: { in: ACTIVE_STATUSES } }
        : { status },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const contactIds = [...new Set(drafts.map((draft) => draft.mauticContactId).filter((id): id is number => id != null))];
  const oldestDraftDate = drafts.length ? drafts.reduce((oldest, draft) => (draft.createdAt < oldest ? draft.createdAt : oldest), drafts[0].createdAt) : null;
  const events =
    contactIds.length > 0 && oldestDraftDate
      ? await prisma.mauticEvent.findMany({
          where: {
            mauticContactId: { in: contactIds },
            eventType: { in: ["page.hit", "email.click"] },
            occurredAt: { gte: oldestDraftDate },
          },
          orderBy: { occurredAt: "desc" },
          take: 500,
        })
      : [];

  const draftsWithActivity = drafts.map((draft) => {
    const matchedEvents = events.filter((event) => event.mauticContactId === draft.mauticContactId && eventMatchesDraft(event.clickedUrl, draft));
    return {
      ...draft,
      activity: {
        trackedUrls: urlsFromDraft(draft),
        clickCount: matchedEvents.length,
        lastClickedAt: matchedEvents[0]?.occurredAt ?? null,
        lastClickedUrl: matchedEvents[0]?.clickedUrl ?? null,
        eventTypes: [...new Set(matchedEvents.map((event) => event.eventType))],
      },
    };
  });

  return NextResponse.json(draftsWithActivity);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.channel || !body.body) {
    return NextResponse.json({ error: "channel en body zijn verplicht" }, { status: 400 });
  }

  const draft = await prisma.followUpDraft.create({
    data: {
      channel: body.channel,
      purpose: body.purpose || "manual",
      aiCallJobId: body.aiCallJobId || null,
      aiCallResultId: body.aiCallResultId || null,
      mauticContactId: body.mauticContactId || null,
      projectId: body.projectId || null,
      recipientName: body.recipientName || null,
      recipientPhone: body.recipientPhone || null,
      recipientEmail: body.recipientEmail || null,
      subject: body.subject || null,
      body: body.body,
      links: body.links || null,
      createdBy: body.createdBy || "manual",
    },
  });

  return NextResponse.json(draft, { status: 201 });
}
