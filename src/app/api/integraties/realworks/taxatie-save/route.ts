import { NextRequest, NextResponse } from "next/server";
import { knowledgeAccess } from "@/lib/knowledge/auth";
import { ingestKnowledge } from "@/lib/knowledge/ingest";
import { normalizeText, slugify } from "@/lib/knowledge/sanitize";

const TEXT_FIELDS: Record<string, string> = {
  taxobjdescrtext: "Objectomschrijving",
  taxobjindelingtext: "Indeling",
  omgeving_locatie_text: "Omgeving - locatie",
  omgeving_bereikbaarheid_text: "Omgeving - bereikbaarheid",
  omgeving_omliggende_bebouwing_text: "Omgeving - omliggende bebouwing",
  omgeving_voorzieningen_text: "Omgeving - voorzieningen",
  huidigelokalemarktomstandighedentext: "Lokale marktomstandigheden",
  swotsterktetext: "SWOT - sterkten",
  swotzwaktetext: "SWOT - zwakten",
  swotkansentext: "SWOT - kansen",
  swotbedreigingentext: "SWOT - bedreigingen",
  waardering_motivatie_text: "Waarderingsmotivatie",
};

export async function POST(request: NextRequest) {
  if (!await knowledgeAccess(request, true)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const taxcode = normalizeText(body.taxcode);
  if (!taxcode) return NextResponse.json({ error: "taxcode ontbreekt" }, { status: 400 });
  const address = [body.taxobjecthstreet, body.taxobjecthhouseno, body.taxobjecthousenoext].map(normalizeText).filter(Boolean).join(" ");
  const fields = Object.entries(TEXT_FIELDS).map(([key, label]) => ({ key, label, content: normalizeText(body[key]) })).filter((field) => field.content);
  if (!fields.length) return NextResponse.json({ success: true, ignored: true, reason: "Geen rapportteksten" });
  const result = await ingestKnowledge({
    slug: `realworks-${slugify(taxcode)}`, title: address || `Taxatie ${taxcode}`, sourceType: "DRAFT_REPORT",
    authorityRank: 20, reportTaxateur: normalizeText(body.taxateurcode_result), reportAddress: address,
    reportPostcode: normalizeText(body.taxobjecthzipcode), reportCity: normalizeText(body.taxobjecthcity),
    reportPropertyType: normalizeText(body.taxobjtype_result || body.taxobjecttype),
    reportBuildYear: Number.parseInt(normalizeText(body.fixatie_bouwjaar || body.taxobjbouwjaartext), 10) || null,
    realworksTaxcode: taxcode, realworksDossierNumber: normalizeText(body.rapportnummer), validationStatus: "AWAITING_NWWI",
    status: "PENDING", fields, metadata: { savedAt: new Date().toISOString(), source: "realworks-extension" },
  });
  return NextResponse.json({ success: true, sourceId: result.id, status: "PENDING" });
}
