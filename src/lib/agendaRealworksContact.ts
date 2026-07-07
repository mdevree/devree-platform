import { prisma } from "@/lib/prisma";

export type RealworksRelationContact = {
  relationId: string | null;
  realworksCode: string | null;
  firstname: string;
  lastname: string;
  name: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  source: "person_save" | "agenda_save";
};

type AgendaContactLookupInput = {
  systemid: number;
  agrcode: string | null;
  relationRelationid: string | null;
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parsePreview(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function contactFromPersonSave(fields: Record<string, unknown>): RealworksRelationContact | null {
  const relationId = clean(fields._systemid);
  const firstname = clean(fields.firstname) ?? "";
  const lastname = clean(fields.lastname) ?? "";
  const email = clean(fields.email);
  const mobile = clean(fields.mobile);
  const phone = clean(fields.tel1) ?? clean(fields.tel2);
  const realworksCode = clean(fields.rcode);
  const name = [firstname, lastname].filter(Boolean).join(" ").trim();

  if (!relationId && !realworksCode && !email && !mobile && !name) return null;

  return {
    relationId,
    realworksCode,
    firstname,
    lastname,
    name,
    email,
    mobile,
    phone,
    source: "person_save",
  };
}

function splitName(name: string | null): { firstname: string; lastname: string } {
  if (!name) return { firstname: "", lastname: "" };
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstname: parts[0] ?? "", lastname: "" };
  return { firstname: parts.slice(0, -1).join(" "), lastname: parts.at(-1) ?? "" };
}

function contactFromAgendaSave(fields: Record<string, unknown>): RealworksRelationContact | null {
  const systemid = clean(fields.systemid) ?? clean(fields._systemid);
  const realworksCode = clean(fields.agrcode);
  const relationName = clean(fields.agrcode_result);
  if (!systemid && !realworksCode && !relationName) return null;

  const { firstname, lastname } = splitName(relationName);
  return {
    relationId: null,
    realworksCode,
    firstname,
    lastname,
    name: relationName ?? "",
    email: null,
    mobile: null,
    phone: null,
    source: "agenda_save",
  };
}

export async function findRealworksContactForAgenda(
  afspraak: AgendaContactLookupInput
): Promise<RealworksRelationContact | null> {
  const relationId = afspraak.relationRelationid?.trim() || null;
  const agrcode = afspraak.agrcode?.trim() || null;
  const systemid = String(afspraak.systemid);

  const personCaptures = relationId
    ? await prisma.realworksBackupCapture.findMany({
        where: {
          host: "crm.realworks.nl",
          path: "/servlets/objects/rela.person/save",
          requestBodyPreview: { contains: `"${relationId}"` },
        },
        orderBy: [{ capturedAt: "desc" }, { receivedAt: "desc" }],
        take: 5,
      })
    : [];

  for (const capture of personCaptures) {
    const fields = parsePreview(capture.requestBodyPreview);
    if (!fields) continue;
    const contact = contactFromPersonSave(fields);
    if (contact?.relationId === relationId) return contact;
  }

  const agendaCaptures = await prisma.realworksBackupCapture.findMany({
    where: {
      host: "crm.realworks.nl",
      path: "/servlets/objects/rela.agenda/save",
      requestBodyPreview: { contains: `"${systemid}"` },
    },
    orderBy: [{ capturedAt: "desc" }, { receivedAt: "desc" }],
    take: 5,
  });

  for (const capture of agendaCaptures) {
    const fields = parsePreview(capture.requestBodyPreview);
    if (!fields) continue;
    const contact = contactFromAgendaSave(fields);
    if (contact && (!agrcode || contact.realworksCode === agrcode)) return contact;
  }

  return null;
}

