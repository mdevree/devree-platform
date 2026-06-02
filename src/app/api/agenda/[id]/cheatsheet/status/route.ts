import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const TOEGESTANE_STATUS = ["gevraagd", "gegenereerd", "mislukt", "verwerkt"];

/**
 * POST /api/agenda/[id]/cheatsheet/status
 *
 * Callback vanuit n8n nadat de cheatsheet-PDF is gegenereerd en in Nextcloud is
 * opgeslagen. Slaat status + opslaglocatie op zodat de UI een downloadlink kan
 * tonen en de voortgang kan volgen.
 *
 * Geautoriseerd via x-webhook-secret (n8n) of een actieve sessie.
 *
 * Body: { cheatsheetStatus, cheatsheetPath?, cheatsheetUrl? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const status: string | undefined = body.cheatsheetStatus;
  if (!status || !TOEGESTANE_STATUS.includes(status)) {
    return NextResponse.json(
      { error: `cheatsheetStatus moet één van ${TOEGESTANE_STATUS.join(", ")} zijn` },
      { status: 400 }
    );
  }

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const updated = await prisma.agendaAfspraak.update({
    where: { id },
    data: {
      cheatsheetStatus: status,
      ...(body.cheatsheetPath !== undefined ? { cheatsheetPath: body.cheatsheetPath } : {}),
      ...(body.cheatsheetUrl !== undefined ? { cheatsheetUrl: body.cheatsheetUrl } : {}),
      ...(status === "gegenereerd" ? { cheatsheetGeneratedAt: new Date() } : {}),
    },
    select: {
      id: true,
      cheatsheetStatus: true,
      cheatsheetPath: true,
      cheatsheetUrl: true,
      cheatsheetGeneratedAt: true,
    },
  });

  return NextResponse.json({ ok: true, ...updated });
}
