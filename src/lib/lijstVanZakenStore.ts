import { prisma } from "@/lib/prisma";
import { storedLijstVanZaken } from "@/lib/propertyBriefingStore";
export async function getLijstVanZaken(objectcode: string | null | undefined) {
  if (!objectcode) return null;
  const row = await prisma.realworksBackupCapture.findFirst({
    where: { source: `lijstvanzaken:${objectcode}` },
    orderBy: [{ capturedAt: "desc" }, { receivedAt: "desc" }],
  });
  if (!row?.requestBodyPreview) return null;
  return { ...(await storedLijstVanZaken(JSON.parse(row.requestBodyPreview))), capturedAt: row.capturedAt?.toISOString() || null, receivedAt: row.receivedAt.toISOString(), httpStatus: row.status, origin: row.transport };
}
