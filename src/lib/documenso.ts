export type DocumensoRecipient = {
  name: string;
  email: string;
  role: "SIGNER" | "CC";
  signingOrder?: number;
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

function apiToken() {
  const token = process.env.DOCUMENSO_API_TOKEN;
  if (!token) {
    throw new DocumensoApiError("DOCUMENSO_API_TOKEN ontbreekt");
  }
  return token;
}

async function documensoFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
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

function blobPart(buffer: Buffer) {
  return new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
}

async function downloadEnvelopeItem(itemId: string) {
  const res = await documensoFetch(`/api/v2/envelope/item/${encodeURIComponent(itemId)}/download?version=original`);
  const contentDisposition = res.headers.get("content-disposition") || "";
  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch?.[1] || `${itemId}.pdf`;
  return {
    filename,
    bytes: Buffer.from(await res.arrayBuffer()),
  };
}

async function addEnvelopeItems(envelopeId: string, files: Array<{ filename: string; bytes: Buffer }>) {
  for (const file of files) {
    const form = new FormData();
    form.append("payload", JSON.stringify({ envelopeId }));
    form.append("files", new Blob([blobPart(file.bytes)], { type: "application/pdf" }), file.filename);

    await documensoFetch("/api/v2/envelope/item/create-many", {
      method: "POST",
      body: form,
    });
  }
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
  const form = new FormData();
  form.append("payload", JSON.stringify({
    title,
    externalId,
    recipients,
    meta: {
      timezone: "Europe/Amsterdam",
      dateFormat: "dd/MM/yyyy HH:mm",
      language: "nl",
      distributionMethod: "NONE",
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

  const attachmentFiles: Array<{ filename: string; bytes: Buffer }> = [];
  for (const itemId of templateAttachmentItemIds()) {
    try {
      attachmentFiles.push(await downloadEnvelopeItem(itemId));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Bijlage ${itemId} kon niet worden opgehaald`);
    }
  }

  try {
    await addEnvelopeItems(created.envelopeId, attachmentFiles);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Documenso-bijlagen konden niet worden toegevoegd");
  }

  const url = baseUrl();
  return {
    documentId: created.id,
    envelopeId: created.envelopeId,
    documentUrl: `${url}/documents/${created.id}`,
    editUrl: `${url}/documents/${created.id}/edit`,
    warnings,
  };
}
