import { newsletterMautic } from "@/lib/mautic";
import { safeUrl, remoteHash, assertRemoteDraft, type RemoteEmail, NEWSLETTER_SEGMENT_ID } from "@/lib/newsletter/rules";
import { newsletterAudience } from "@/lib/newsletter/editor";
import { prisma } from "@/lib/prisma";
import {
  getEmailSummary,
  getSegmentSubscriberCount,
  listSegments,
  type MauticEmailSummary,
  type MauticSegment,
} from "@/lib/mautic";

type NewsletterBlockInput = {
  type: string;
  title: string | null;
  body: string | null;
  url: string | null;
  ctaLabel: string | null;
  item?: {
    title: string;
    url: string | null;
    description: string | null;
  } | null;
};

type NewsletterIssueInput = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  blocks: NewsletterBlockInput[];
};

export type RenderedNewsletter = {
  html: string;
  plainText: string;
};

export type NewsletterDashboard = {
  audience: {members:number;eligible:number;excluded:number}|null;
  subscriberCount: number | null;
  subscriberLabel: string;
  segments: MauticSegment[];
  latestIssue: {
    id: string;
    name: string;
    subject: string;
    status: string;
    mauticEmailId: number | null;
    mauticEmailUrl: string | null;
    exportedAt: string | null;
    sentCount: number | null;
    openCount: number;
    clickCount: number;
    openRate: number | null;
    clickRate: number | null;
    mautic: MauticEmailSummary | null;
  } | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(value: string): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function buildNewsletterUrl(url: string | null | undefined, issueName: string): string | null {
  const safe = safeUrl(url);
  if (!safe) return null;
  try {
    const parsed = new URL(safe);
    parsed.searchParams.set("utm_source", "nieuwsbrief");
    parsed.searchParams.set("utm_medium", "email");
    parsed.searchParams.set("utm_campaign", issueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    return parsed.toString();
  } catch {
    return null;
  }
}

function blockText(block: NewsletterBlockInput): { title: string; body: string; url: string | null; ctaLabel: string } {
  return {
    title: block.title || "",
    body: block.body || "",
    url: block.url || null,
    ctaLabel: block.ctaLabel || "Lees meer",
  };
}

function renderButton(url: string, label: string): string {
  return `<p style="margin:18px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#03543d;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 18px;font-weight:700">${escapeHtml(label)}</a></p>`;
}

function renderBlock(block: NewsletterBlockInput, issueName: string): string {
  const data = blockText(block);
  const url = buildNewsletterUrl(data.url, issueName);
  const title = data.title ? `<h2 style="margin:0 0 10px;color:#111827;font-size:22px;line-height:1.25">${escapeHtml(data.title)}</h2>` : "";
  const body = data.body ? `<div style="color:#374151;font-size:15px;line-height:1.65">${textToHtml(data.body)}</div>` : "";

  if (block.type === "CTA") {
    return `<tr><td style="padding:22px 28px;background:#f0fdf4;border-radius:8px">${title}${body}${url ? renderButton(url, data.ctaLabel) : ""}</td></tr>`;
  }

  if (block.type === "HERO") {
    return `<tr><td style="padding:30px 28px;background:#03543d;border-radius:8px;color:#ffffff"><h1 style="margin:0 0 12px;color:#ffffff;font-size:28px;line-height:1.2">${escapeHtml(data.title || "Nieuws van De Vree")}</h1>${data.body ? `<div style="font-size:16px;line-height:1.65">${textToHtml(data.body).replace(/<p>/g, '<p style="margin:0 0 12px;color:#ffffff">')}</div>` : ""}${url ? renderButton(url, data.ctaLabel) : ""}</td></tr>`;
  }

  return `<tr><td style="padding:22px 0;border-bottom:1px solid #e5e7eb">${title}${body}${url ? `<p style="margin:12px 0 0"><a href="${escapeHtml(url)}" style="color:#03543d;font-weight:700;text-decoration:none">${escapeHtml(data.ctaLabel)}</a></p>` : ""}</td></tr>`;
}

export function renderNewsletterIssue(issue: NewsletterIssueInput): RenderedNewsletter {
  const blocks = issue.blocks.length
    ? issue.blocks.map((block) => renderBlock(block, "editie-" + issue.id)).join("")
    : `<tr><td style="padding:22px 0;color:#6b7280">Deze nieuwsbrief bevat nog geen blokken.</td></tr>`;

  const preheader = issue.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(issue.preheader)}</div>`
    : "";

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(issue.subject)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
${preheader}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:10px;padding:28px">
<tr><td style="padding-bottom:22px;border-bottom:1px solid #e5e7eb">
<p style="margin:0;color:#03543d;font-weight:700;font-size:14px">De Vree Makelaardij</p>
<h1 style="margin:8px 0 0;color:#111827;font-size:26px;line-height:1.25">${escapeHtml(issue.subject)}</h1>
${issue.preheader ? `<p style="margin:8px 0 0;color:#6b7280;font-size:15px">${escapeHtml(issue.preheader)}</p>` : ""}
</td></tr>
${blocks}
<tr><td style="padding-top:24px;color:#6b7280;font-size:12px;line-height:1.5">
De Vree Makelaardij<br>
U ontvangt deze nieuwsbrief omdat u bent ingeschreven via De Vree Makelaardij.<br>
<a href="{unsubscribe_url}" style="color:#03543d">Afmelden voor de nieuwsbrief</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const plainTextBlocks = issue.blocks
    .map((block) => {
      const data = blockText(block);
      const url = buildNewsletterUrl(data.url, "editie-" + issue.id);
      return [data.title, data.body, url ? `${data.ctaLabel}: ${url}` : null].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return {
    html,
    plainText: `${issue.subject}\n${issue.preheader || ""}\n\n${plainTextBlocks}\n\nDe Vree Makelaardij\nAfmelden: {unsubscribe_url}`.trim(),
  };
}

export function normalizeSegmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

async function getSubscriberCount(segmentIds: number[], segments: MauticSegment[]): Promise<number | null> {
  if (!segmentIds.length) return null;
  const counts = await Promise.all(
    segmentIds.map((id) => {
      const segment = segments.find((entry) => entry.id === id);
      return getSegmentSubscriberCount(id, segment?.alias);
    })
  );
  const knownCounts = counts.filter((count): count is number => count !== null);
  if (!knownCounts.length) return null;
  return knownCounts.reduce((sum, count) => sum + count, 0);
}

function findNewsletterSegmentIds(segments: MauticSegment[]): number[] {
  const newsletterSegments = segments.filter((segment) => {
    const name = segment.name.toLowerCase();
    const alias = segment.alias?.toLowerCase() || "";
    return name === "nieuwsbrief" || alias === "nieuwsbrief" || name.includes("newsletter") || alias.includes("newsletter");
  });

  return newsletterSegments.map((segment) => segment.id);
}

export async function getNewsletterDashboard(): Promise<NewsletterDashboard> {
  const [segments, latestIssue] = await Promise.all([
    listSegments(),
    prisma.newsletterIssue.findFirst({
      orderBy: [{ exportedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const issueSegmentIds = normalizeSegmentIds(latestIssue?.segmentIds);
  const newsletterSegmentIds = findNewsletterSegmentIds(segments);
  const metricSegmentIds = issueSegmentIds.length > 0 ? issueSegmentIds : newsletterSegmentIds;
  const subscriberCount =
    metricSegmentIds.length > 0
      ? await getSubscriberCount(metricSegmentIds, segments)
      : segments.reduce<number | null>((sum, segment) => {
          if (segment.subscriberCount === null) return sum;
          return (sum ?? 0) + segment.subscriberCount;
        }, null);

  const audience=await newsletterAudience().catch(()=>null);
  if (!latestIssue) {
    return {
      audience,
      subscriberCount,
      subscriberLabel: newsletterSegmentIds.length ? "Abonnees nieuwsbrief" : "Abonnees in Mautic segmenten",
      segments,
      latestIssue: null,
    };
  }

  const emailId = latestIssue.mauticEmailId;
  const [mautic, openCount, clickCount] = await Promise.all([
    emailId ? getEmailSummary(emailId) : Promise.resolve(null),
    emailId
      ? prisma.mauticEvent.count({ where: { emailId, eventType: "email.open" } })
      : Promise.resolve(0),
    emailId
      ? prisma.mauticEvent.count({ where: { emailId, eventType: "email.click" } })
      : Promise.resolve(0),
  ]);

  const sentCount = mautic?.sentCount ?? null;
  const resolvedOpenCount = mautic?.readCount ?? openCount;
  const resolvedClickCount = mautic?.clickCount ?? clickCount;

  return {
    audience,
    subscriberCount,
    subscriberLabel: issueSegmentIds.length ? "Abonnees in laatste editie" : "Abonnees nieuwsbrief",
    segments,
    latestIssue: {
      id: latestIssue.id,
      name: latestIssue.name,
      subject: latestIssue.subject,
      status: latestIssue.status,
      mauticEmailId: emailId,
      mauticEmailUrl: latestIssue.mauticEmailUrl,
      exportedAt: latestIssue.exportedAt?.toISOString() ?? null,
      sentCount,
      openCount: resolvedOpenCount,
      clickCount: resolvedClickCount,
      openRate: null,
      clickRate: null,
      mautic,
    },
  };
}

export async function exportNewsletterIssue(issueId: string): Promise<{ mauticEmailId: number; mauticEmailUrl: string | null }> {
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({where:{id:issueId},include:{blocks:{orderBy:{position:'asc'},include:{item:true}}}});
  if(issue.status !== 'READY' && !(issue.status==='EXPORTED' && issue.exportedRevision===issue.revision)) throw new Error('Keur deze versie eerst goed.');
  if(issue.approvedRevision!==issue.revision || !issue.approvedBy) throw new Error('Goedkeuring ontbreekt of is verlopen.');
  const segmentIds=normalizeSegmentIds(issue.segmentIds);
  if(!segmentIds.length || (issue.monthKey && (segmentIds.length!==1 || segmentIds[0]!==NEWSLETTER_SEGMENT_ID))) throw new Error('Controleer de doelgroep.');
  if(issue.blocks.some(b=>b.item && !b.item.sourceActive)) throw new Error('Een bronartikel is niet meer gepubliceerd.');
  const lock=new Date();
  const claimed=await prisma.newsletterIssue.updateMany({where:{id:issue.id,revision:issue.revision,exportLockAt:null},data:{exportLockAt:lock}});
  if(claimed.count!==1) throw new Error('Er loopt al een export.');
  try {
    const name=`${issue.name} [dv:${issue.id}]`;
    let remote: RemoteEmail | undefined;
    if(issue.mauticEmailId) {
      remote=(await newsletterMautic<{email:RemoteEmail}>(`/api/emails/${issue.mauticEmailId}`)).email;
      assertRemoteDraft(remote,issue.exportHash);
    } else {
      const found=await newsletterMautic<{emails:Record<string,RemoteEmail>}>(`/api/emails?search=${encodeURIComponent('[dv:'+issue.id+']')}&limit=100`);
      const matches=Object.values(found.emails||{}).filter(e=>e.name.endsWith(`[dv:${issue.id}]`));
      if(matches.length>1) throw new Error('Meerdere concepten gevonden. Controleer de Mautic-koppeling.');
      remote=matches[0];
      if(remote) assertRemoteDraft(remote);
      else if(issue.exportAttemptedAt) throw new Error('Eerdere exportuitkomst onzeker. Controleer in Mautic voordat een nieuw concept wordt aangemaakt.');
    }
    const rendered=renderNewsletterIssue(issue);
    const payload={ name, subject:issue.subject, preheaderText:issue.preheader||'', emailType:'list', language:'nl', isPublished:false, lists:segmentIds, customHtml:rendered.html, plainText:rendered.plainText, sendToDnc:false };
    // Recover a created-but-unrecorded email only if its content matches this approved version.
    if(remote && !issue.mauticEmailId && remoteHash(remote)!==remoteHash({...payload,id:remote.id})) throw new Error('Teruggevonden concept wijkt af. Controleer dit in Mautic.');
    await prisma.newsletterIssue.update({where:{id:issue.id},data:{exportAttemptedAt:new Date()}});
    const saved=await newsletterMautic<{email:RemoteEmail}>(remote?`/api/emails/${remote.id}/edit`:'/api/emails/new',{method:remote?'PATCH':'POST',body:JSON.stringify(payload)});
    if(!saved.email?.id) throw new Error('Mautic gaf geen concept-ID terug.');
    // Store the identity immediately, before a potentially failing readback.
    await prisma.newsletterIssue.update({where:{id:issue.id},data:{mauticEmailId:saved.email.id,exportHash:remoteHash({...payload,id:saved.email.id})}});
    const check=(await newsletterMautic<{email:RemoteEmail}>(`/api/emails/${saved.email.id}`)).email;
    assertRemoteDraft(check);
    if(remoteHash(check)!==remoteHash({...payload,id:check.id})) throw new Error('Mautic-teruglezing wijkt af van de goedgekeurde editie.');
    const url=`${(process.env.MAUTIC_URL||'https://connect.devreemakelaardij.nl').replace(/\/$/,'')}/s/emails/view/${check.id}`;
    await prisma.newsletterIssue.update({where:{id:issue.id},data:{status:'EXPORTED',mauticEmailId:check.id,mauticEmailUrl:url,exportedAt:new Date(),exportedRevision:issue.revision,exportHash:remoteHash(check)}});
    return {mauticEmailId:check.id,mauticEmailUrl:url};
  } finally {
    await prisma.newsletterIssue.updateMany({where:{id:issue.id,exportLockAt:lock},data:{exportLockAt:null}});
  }
}
