import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { enrichAgendaAfspraak } from "@/lib/agendaEnrich";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const updated = await enrichAgendaAfspraak(id);
  if (!updated)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  return NextResponse.json(updated);
}
