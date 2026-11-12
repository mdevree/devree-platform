import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withProfileLock } from "@/lib/contactProfileLock";
import { deliverMobileNote } from "@/lib/mobileCalls";
import { createMobileMauticNote, findMobileMauticNote, verifyMobileMauticNote, updateContact } from "@/lib/mautic";
import { geldigeInvoer, type Verslag } from "@/lib/bezichtigingsverslag";

type Params = {params: Promise<{id: string}>};
const keyFor = (id: string) => "bezichtigingsverslag:" + id;
const error = (message: string, status: number) => NextResponse.json({error: message}, {status});

export async function GET(_req: NextRequest, {params}: Params) {
  if (!(await auth())?.user) return error("Log opnieuw in.", 401);
  const {id} = await params;
  const row = await prisma.appSetting.findUnique({where: {key: keyFor(id)}});
  return NextResponse.json({verslag: row?.value ?? null}, {headers: {"Cache-Control":"private, no-store"}});
}

export async function POST(req: NextRequest, {params}: Params) {
  if (!(await auth())?.user) return error("Log opnieuw in.", 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(process.env.NEXTAUTH_URL || req.url).origin) return error("Onbekende herkomst.", 403);
  const {id} = await params;
  const body = await req.json().catch(() => null);
  if (!body || !geldigeInvoer(body.invoer) || !Number.isSafeInteger(body.versie) ||
      !["concept","verwerk"].includes(body.actie)) return error("Controleer de invoer en vul minstens één veld in.", 400);
  const key = keyFor(id);
  try {
    return await withProfileLock(key, async () => {
      const afspraak = await prisma.agendaAfspraak.findUnique({where:{id}});
      if (!afspraak?.agtype?.toLowerCase().includes("bezichtiging")) return error("Bezichtiging niet gevonden.",404);
      const row = await prisma.appSetting.findUnique({where:{key}});
      const oud = row?.value as Verslag | undefined;
      if (oud?.status === "verwerkt") return NextResponse.json({verslag: oud});
      if (oud?.status !== "verwerken" && (oud?.versie ?? 0) !== body.versie)
        return error("Het verslag is intussen gewijzigd. Open de afspraak opnieuw om de opgeslagen versie te bekijken.",409);
      const opslaan = async (v: Verslag) => prisma.appSetting.upsert({where:{key},create:{key,value:v},update:{value:v}});
      const verslag: Verslag = oud?.status === "verwerken" ? oud : {
        invoer: body.invoer, versie: body.versie + 1, status: "concept", tijdstip: new Date().toISOString(),
      };
      if (verslag.status === "concept") {
        if (body.actie === "concept") {
          await opslaan(verslag);
          return NextResponse.json({verslag});
        }
        if (!afspraak.mauticContactId || body.contactId !== afspraak.mauticContactId)
          return error("Controleer eerst het gekoppelde Mautic-contact. Je kunt het verslag als concept bewaren.",409);
        if (afspraak.cheatsheetStatus === "verwerkt")
          return error("Deze afspraak is al via de PDF verwerkt. Je kunt aanvullende aantekeningen als concept bewaren.",409);
        verslag.contactId = afspraak.mauticContactId;
        verslag.tijdstip = afspraak.agbegin?.toISOString() || verslag.tijdstip;
        verslag.status = "verwerken";
        await opslaan(verslag);
      }
      const cid = verslag.contactId!;
      if (cid !== afspraak.mauticContactId) return error("De contactkoppeling is gewijzigd. Controleer het dossier.",409);
      const v = verslag.invoer;
      const marker = "[Bezichtigingsverslag:" + id + "]";
      const lines = ["Bezichtiging", v.notities, v.interesse && "Interesse: " + v.interesse + "/100",
        v.verkoopstatus && "Verkoopgesprek: " + v.verkoopstatus, v.vervolgactie && "Vervolgactie: " + v.vervolgactie, marker];
      const html = "<p>" + lines.filter(Boolean).join("\n").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>") + "</p>";
      try {
        if (!verslag.notitieId) {
          verslag.notitieId = await deliverMobileNote({
            find: () => findMobileMauticNote(cid,marker),
            verify: n => verifyMobileMauticNote(n,cid,marker,html),
            create: () => createMobileMauticNote(cid,html,verslag.tijdstip,"general"),
            beforeCreate: async () => { verslag.poging = Date.now(); await opslaan(verslag); },
          }, verslag.poging);
          await opslaan(verslag);
        }
        const velden: Record<string,string|number> = {};
        if (v.notities) velden.bezichtiging_notities = v.notities;
        if (v.interesse) velden.bezichtiging_interesse = Number(v.interesse);
        if (v.verkoopstatus) velden.verkoopgesprek_status = v.verkoopstatus;
        if (Object.keys(velden).length && !await updateContact(cid,velden,AbortSignal.timeout(15000))) throw Error("Mautic");
      } catch {
        return NextResponse.json({verslag, melding:"Opgeslagen bij de afspraak. De verwerking in Mautic is nog niet bevestigd. Probeer opnieuw."},{status:202});
      }
      verslag.status = "verwerkt";
      await prisma.$transaction([
        prisma.agendaAfspraak.update({where:{id},data:{cheatsheetStatus:"verwerkt"}}),
        prisma.appSetting.update({where:{key},data:{value:verslag}}),
      ]);
      return NextResponse.json({verslag});
    });
  } catch { return error("Opslaan niet bevestigd. Probeer het opnieuw.",503); }
}
