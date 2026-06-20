import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { updateContact, addMauticNote, addContactPoints } from "@/lib/mautic";

/**
 * POST /api/agenda/[id]/cheatsheet/verwerk
 *
 * Terugverwerking van de Boox-aantekeningen: n8n leest de geannoteerde PDF via
 * OCR en stuurt de herkende waarden hierheen. We schrijven ze naar Mautic.
 *
 * Vanwege OCR-onzekerheid is `bevestigd` standaard false: dan slaan we de
 * herkende waarden alleen als notitie op (concept) en wijzigen we geen velden.
 * Pas met `bevestigd: true` worden de Mautic-velden daadwerkelijk bijgewerkt.
 *
 * Body:
 * {
 *   mauticContactId?: number,
 *   bevestigd?: boolean,
 *   bezichtigingNotities?: string,
 *   bezichtigingInteresse?: number,   // 0-100
 *   verkoopgesprekStatus?: string,
 *   vervolgactie?: string
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Ongeldige JSON" }, { status: 400 });
  }

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const mauticContactId: number | null =
    body.mauticContactId ?? afspraak.mauticContactId ?? null;
  if (!mauticContactId) {
    return NextResponse.json(
      { error: "Geen Mautic-contact gekoppeld aan deze afspraak" },
      { status: 422 }
    );
  }

  // Boox kan hetzelfde bestand opnieuw synchroniseren. Verwerk een afspraak
  // daarom maximaal één keer, onafhankelijk van n8n-bestandsmetadata.
  if (afspraak.cheatsheetStatus === "verwerkt") {
    return NextResponse.json({
      ok: true,
      status: "al_verwerkt",
      bericht: "Deze bezichtigingsaantekeningen waren al verwerkt.",
    });
  }

  const bevestigd = body.bevestigd === true;

  // Bouw een leesbare samenvatting van de herkende aantekeningen.
  const regels: string[] = [];
  if (body.bezichtigingInteresse !== undefined)
    regels.push(`Interesse: ${body.bezichtigingInteresse}/100`);
  if (body.bezichtigingNotities)
    regels.push(`Notities: ${body.bezichtigingNotities}`);
  if (body.verkoopgesprekStatus)
    regels.push(`Status: ${body.verkoopgesprekStatus}`);
  if (body.vervolgactie) regels.push(`Vervolgactie: ${body.vervolgactie}`);

  const samenvatting = regels.join("\n");

  // Altijd een notitie loggen (concept of definitief) zodat niets verloren gaat.
  await addMauticNote(
    mauticContactId,
    `${bevestigd ? "Bezichtiging-aantekeningen" : "Concept bezichtiging-aantekeningen (OCR, te bevestigen)"}:\n${samenvatting}`,
    afspraak.agbegin
  );

  if (!bevestigd) {
    return NextResponse.json({
      ok: true,
      status: "concept",
      bericht: "Als notitie opgeslagen; velden niet gewijzigd tot bevestiging.",
    });
  }

  // Bevestigd: werk de Mautic-velden bij.
  const velden: Record<string, string | number | null> = {};
  if (body.bezichtigingNotities !== undefined)
    velden.bezichtiging_notities = body.bezichtigingNotities;
  if (body.bezichtigingInteresse !== undefined)
    velden.bezichtiging_interesse = Number(body.bezichtigingInteresse);
  if (body.verkoopgesprekStatus !== undefined)
    velden.verkoopgesprek_status = body.verkoopgesprekStatus;

  if (Object.keys(velden).length > 0) {
    await updateContact(mauticContactId, velden);
  }

  // Markeer de bezichtiging als verwerkt zodat de UI de cyclus sluit.
  await prisma.agendaAfspraak.update({
    where: { id },
    data: { cheatsheetStatus: "verwerkt" },
  });

  // Een afgeronde bezichtiging met hoge interesse is een sterk koopsignaal.
  const interesse = Number(body.bezichtigingInteresse);
  if (!Number.isNaN(interesse) && interesse >= 60) {
    try {
      await addContactPoints(mauticContactId, 5);
    } catch (err) {
      console.error("Kon bezichtiging-punten niet toekennen:", err);
    }
  }

  return NextResponse.json({ ok: true, status: "bijgewerkt", velden });
}
