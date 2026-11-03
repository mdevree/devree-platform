import { prisma } from "@/lib/prisma";
import { normalizeVragenlijst } from "@/lib/vragenlijst";
export async function getVragenlijst(objectcode: string | null | undefined) {
  if (!objectcode) return null;
  const row = await prisma.realworksBackupCapture.findFirst({ where: { source: `vragenlijst:${objectcode}` }, orderBy: [{ capturedAt: "desc" }, { receivedAt: "desc" }] });
  if (!row?.requestBodyPreview) return null;
  return { ...normalizeVragenlijst(JSON.parse(row.requestBodyPreview)), capturedAt: row.capturedAt?.toISOString() || null, receivedAt: row.receivedAt.toISOString(), origin: row.transport };
}
