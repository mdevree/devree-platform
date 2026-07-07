export type DocumensoRecipient = {
  name: string;
  email: string;
  role: "SIGNER" | "CC";
  signingOrder?: number;
};

type DocumensoField = {
  type: "INITIALS" | "SIGNATURE" | "DATE";
  pageNumber: number;
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

type DocumensoAttachmentLink = {
  label: string;
  data: string;
};

export type DocumensoConceptResult = {
  documentId: number;
  envelopeId: string;
  documentUrl: string;
  editUrl: string;
  warnings: string[];
};

class DocumensoApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "DocumensoApiError";
  }
}

function baseUrl() {
  return (process.env.DOCUMENSO_URL || "https://ondertekenen.devreemakelaardij.nl").replace(/\/$/, "");
}

function apiBaseUrl() {
  return (process.env.DOCUMENSO_API_URL || process.env.DOCUMENSO_URL || "https://ondertekenen.devreemakelaardij.nl").replace(/\/$/, "");
}

function apiToken() {
  const token = process.env.DOCUMENSO_API_TOKEN;
  if (!token) {
    throw new DocumensoApiError("DOCUMENSO_API_TOKEN ontbreekt");
  }
  return token;
}

async function documensoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new DocumensoApiError(`Documenso API fout (${res.status}): ${message || res.statusText}`, res.status);
  }

  return res;
}

function templateAttachmentItemIds() {
  return (process.env.DOCUMENSO_OTD_ATTACHMENT_ITEM_IDS || "envelope_item_voenxhxtymcfmfti,envelope_item_ckdzuncvzlhmnahm")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function allowedOtdAttachmentItemIds() {
  return templateAttachmentItemIds();
}

function publicPlatformBaseUrl() {
  const url = process.env.DOCUMENSO_ATTACHMENT_PUBLIC_BASE_URL
    || process.env.NEXT_PUBLIC_PLATFORM_URL
    || process.env.PLATFORM_BASE_URL
    || process.env.NEXTAUTH_URL;

  if (!url) {
    throw new DocumensoApiError("Publieke platform-URL ontbreekt voor Documenso-bijlagen");
  }

  return url.replace(/\/$/, "");
}

function signingRedirectUrl() {
  return process.env.DOCUMENSO_REDIRECT_URL || "https://www.devreemakelaardij.nl/bedankt-voor-uw-akkoord/";
}

function attachmentLabel(itemId: string) {
  if (itemId === "envelope_item_voenxhxtymcfmfti") return "Algemene consumentenvoorwaarden";
  if (itemId === "envelope_item_ckdzuncvzlhmnahm") return "NVM Protocol Transparant Bieden Woonruimte";
  return itemId;
}

function attachmentLinks(): DocumensoAttachmentLink[] {
  const platformUrl = publicPlatformBaseUrl();
  return templateAttachmentItemIds().map((itemId) => ({
    label: attachmentLabel(itemId),
    data: `${platformUrl}/api/public/documenso/otd-attachment/${encodeURIComponent(itemId)}`,
  }));
}

function blobPart(buffer: Buffer) {
  return new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
}

function pdfPageCount(pdf: Buffer) {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length || 1);
}

function initials(name: string) {
  const parts = name
    .replace(/[^\p{L}\s.-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  const seed = parts.length > 1 ? parts.slice(0, -1) : parts;
  return seed
    .map((part) => part[0]?.toUpperCase())
    .filter(Boolean)
    .join("")
    .slice(0, 4);
}

function signatureSlotFields(slotIndex: number): Pick<DocumensoField, "pageX" | "pageY" | "width" | "height"> {
  const column = slotIndex % 2;
  const row = Math.floor(slotIndex / 2);
  return {
    pageX: column === 0 ? 9 : 54,
    pageY: 15 + row * 24,
    width: 34,
    height: 5,
  };
}

function buildSigningFields(recipient: DocumensoRecipient, slotIndex: number, pageCount: number, includeInitials: boolean): DocumensoField[] {
  if (recipient.role !== "SIGNER") return [];
  const fields: DocumensoField[] = [];

  if (includeInitials) {
    for (let page = 1; page < pageCount; page += 1) {
      fields.push({
        type: "INITIALS",
        pageNumber: page,
        pageX: 84,
        pageY: 93,
        width: 12,
        height: 3,
      });
    }
  }

  const signature = signatureSlotFields(slotIndex);
  fields.push({
    type: "SIGNATURE",
    pageNumber: pageCount,
    ...signature,
  });
  fields.push({
    type: "DATE",
    pageNumber: pageCount,
    pageX: signature.pageX + 6,
    pageY: signature.pageY + 11,
    width: 24,
    height: 3,
  });
  return fields;
}

function withSigningFields(recipients: DocumensoRecipient[], pageCount: number) {
  const customerSigners = recipients.filter((recipient) => recipient.role === "SIGNER" && !/melvin@devreemakelaardij\.nl/i.test(recipient.email));
  const melvin = recipients.find((recipient) => /melvin@devreemakelaardij\.nl/i.test(recipient.email));
  const signingSlots = new Map<string, number>();

  customerSigners.forEach((recipient, index) => signingSlots.set(recipient.email.toLowerCase(), index));
  if (melvin) signingSlots.set(melvin.email.toLowerCase(), customerSigners.length);

  return recipients.map((recipient) => ({
    ...recipient,
    fields: buildSigningFields(
      recipient,
      signingSlots.get(recipient.email.toLowerCase()) ?? 0,
      pageCount,
      customerSigners.some((signer) => signer.email.toLowerCase() === recipient.email.toLowerCase()),
    ).map((field) => ({
      ...field,
      fieldMeta: {
        type: field.type === "SIGNATURE" ? "signature" : field.type === "INITIALS" ? "initials" : "date",
        label: field.type === "INITIALS" ? initials(recipient.name) : undefined,
        required: true,
      },
    })),
  }));
}

export async function downloadOtdAttachmentItem(itemId: string) {
  if (!allowedOtdAttachmentItemIds().includes(itemId)) {
    throw new DocumensoApiError("Onbekende OTD-bijlage", 404);
  }

  const res = await documensoFetch(`/api/v2/envelope/item/${encodeURIComponent(itemId)}/download?version=original`);
  const contentDisposition = res.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || `${itemId}.pdf`;
  return {
    filename,
    bytes: Buffer.from(await res.arrayBuffer()),
  };
}

export async function createDocumensoOtdConcept({
  pdf,
  filename,
  title,
  externalId,
  recipients,
}: {
  pdf: Buffer;
  filename: string;
  title: string;
  externalId: string;
  recipients: DocumensoRecipient[];
}): Promise<DocumensoConceptResult> {
  const warnings: string[] = [];
  const pageCount = pdfPageCount(pdf);
  const form = new FormData();
  form.append("payload", JSON.stringify({
    title,
    externalId,
    recipients: withSigningFields(recipients, pageCount),
    attachments: attachmentLinks(),
    meta: {
      timezone: "Europe/Amsterdam",
      dateFormat: "dd/MM/yyyy HH:mm",
      language: "nl",
      distributionMethod: "NONE",
      redirectUrl: signingRedirectUrl(),
      signingOrder: "SEQUENTIAL",
      subject: title,
      message: "",
    },
  }));
  form.append("file", new Blob([blobPart(pdf)], { type: "application/pdf" }), filename);

  const createRes = await documensoFetch("/api/v2/document/create", {
    method: "POST",
    body: form,
  });
  const created = await createRes.json() as { id: number; envelopeId: string };

  const url = baseUrl();
  return {
    documentId: created.id,
    envelopeId: created.envelopeId,
    documentUrl: `${url}/documents/${created.id}`,
    editUrl: `${url}/documents/${created.id}/edit`,
    warnings,
  };
}
