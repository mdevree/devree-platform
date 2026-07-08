import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ProposalChoiceForm from "./ProposalChoiceForm";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";
import { VERKOOPMETHODE_LABELS } from "@/lib/projectTypes";

export const metadata: Metadata = {
  title: "Voorstel verkoopopdracht | De Vree Makelaardij",
  description: "Voorstel voor de verkoopopdracht van De Vree Makelaardij.",
};

function euro(value: number | null | undefined) {
  if (value == null) return "Nog te bepalen";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number | string | null | undefined) {
  if (value == null || value === "") return "Nog te bepalen";
  return `${String(value).replace(".", ",")}% incl. btw`;
}

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : null;
}

function formatAanvaarding(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "In overleg";

  const normalized = trimmed
    .replace(/\s+/g, " ")
    .replace(/\b(?:per|vanaf)\s+/i, "");
  const isDateLike =
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(normalized)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)
    || /^\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}$/i.test(normalized);

  return isDateLike ? `voorkeur: ${trimmed}` : trimmed;
}

export default async function ProposalPage(
  { params, searchParams }: {
    params: Promise<{ token: string }>;
    searchParams?: Promise<{ preview?: string }>;
  },
) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const previewMode = query.preview === "1" || query.preview === "true";
  const proposal = await prisma.projectProposal.findUnique({
    where: { tokenHash: proposalTokenHash(token) },
    include: { project: true },
  });

  if (!proposal) notFound();

  if (!previewMode) {
    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: {
        viewedAt: proposal.viewedAt || new Date(),
        lastViewedAt: new Date(),
        viewCount: { increment: 1 },
      },
    });
  }

  const project = proposal.project;
  const expired = proposal.expiresAt ? proposal.expiresAt < new Date() : false;
  const unavailable = proposal.status !== "OPEN" || expired;
  const objectAdres = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ");
  const verkoopmethode = project.verkoopmethode
    ? VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode
    : "Nog te bepalen";
  const verkoopstart = proposal.selectedVerkoopstart || project.verkoopstart || "DIRECT";
  const silentSale = proposal.selectedSilentSale || verkoopstart === "SLAPEND";
  const energielabelKosten = project.kostenEnergielabel && project.kostenEnergielabel > 0 ? project.kostenEnergielabel : 0;
  const energielabelOfferKosten = energielabelKosten > 0 ? energielabelKosten : 350;
  const energielabelLabel = energielabelKosten > 0 ? euro(energielabelKosten) : `${euro(energielabelOfferKosten)} indien nodig`;
  const quickscanKosten = project.kostenBouwkundig && project.kostenBouwkundig > 0 ? project.kostenBouwkundig : 0;
  const energielabelChoice = proposal.selectedEnergielabelChoice
    || (energielabelKosten > 0 ? "VIA_MAKELAAR" : "AANWEZIG_OF_ZELF");
  const quickscanChoice = proposal.selectedQuickscanChoice
    || (quickscanKosten > 0 ? "VIA_MAKELAAR" : "ZELF_REGELEN");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 flex flex-col gap-2 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">De Vree Makelaardij</p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950">Voorstel verkoopopdracht</h1>
            {previewMode && (
              <p className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Preview voor kantoor, geen tracking
              </p>
            )}
          </div>
          <div className="text-sm text-gray-500">0181-611919 · info@devreemakelaardij.nl</div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Woning</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-950">{objectAdres || project.name}</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Vraagprijs</dt>
                <dd className="mt-1 font-semibold text-gray-900">{euro(project.vraagprijs)} k.k.</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Courtage</dt>
                <dd className="mt-1 font-semibold text-gray-900">{percent(project.courtagePercentage)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Aanvaarding</dt>
                <dd className="mt-1 font-semibold text-gray-900">{formatAanvaarding(project.aanvaarding)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Verkoopmethode</dt>
                <dd className="mt-1 font-semibold text-gray-900">{verkoopmethode}</dd>
              </div>
            </dl>
          </section>

          <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Kosten</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Publiciteit</dt>
                <dd className="font-medium text-gray-900">{euro(project.kostenPubliciteit ?? 650)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Energielabel</dt>
                <dd className="text-right font-medium text-gray-900">{energielabelLabel}</dd>
              </div>
              {quickscanKosten > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Quickscan</dt>
                  <dd className="text-right font-medium text-gray-900">{euro(quickscanKosten)}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>

        <section className={`mt-5 grid gap-4 ${quickscanKosten > 0 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Publiciteitskosten</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Dit is het maximale budget voor de presentatie van de woning, zoals Funda, fotografie, 360 graden foto&apos;s, video en plattegronden. We brengen dit alleen in rekening volgens de afspraken in de opdracht.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Energielabel</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Indien gewenst zetten wij de opdracht voor u uit om een energielabel te laten opmaken. Een energielabel is verplicht voordat we de woning online publiceren. Als u al een energielabel heeft of dit zelf regelt, kunt u dat aangeven.
            </p>
            <p className="mt-2 text-sm font-medium text-gray-900">
              Kosten via ons: maximaal {euro(energielabelOfferKosten)} incl. btw.
            </p>
          </div>
          {quickscanKosten > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Quickscan</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Voor deze woning adviseren wij om vooraf een quickscan naar de fundering te laten uitvoeren. Dit kunnen wij voor u uitzetten bij een gespecialiseerd bedrijf.
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Volgens de beschikbare funderingsdata is sprake van een verhoogd risico met vastgestelde betrouwbaarheid. Dat betekent dat er voor dit pand sterke aanwijzingen of broninformatie over mogelijke funderingsproblematiek beschikbaar is.
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Bron: FunderMaps (KCAF / FunderConsult).{" "}
                <a
                  href="https://www.devreemakelaardij.nl/vragen/taxatierapport-2026-funderingsrisico/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-800 underline underline-offset-2"
                >
                  Lees meer over funderingsrisico
                </a>
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Kosten: {euro(quickscanKosten)} incl. btw.
              </p>
            </div>
          )}
        </section>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Vervolg</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Na ondertekening maken wij uw digitale klantomgeving aan op Move.nl. Hier kunt u het verkoopproces volgen en de lijst van zaken en vragenlijst voor de verkoop invullen.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Bij direct starten nemen wij zo snel mogelijk contact op om een fotograaf in te plannen.
          </p>
        </section>

        {unavailable ? (
          <section className={`mt-5 rounded-lg border p-5 text-sm ${
            proposal.status === "ACCEPTED" && !expired
              ? "border-emerald-100 bg-emerald-50 text-emerald-900"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}>
            {expired ? (
              "Dit voorstel is verlopen."
            ) : proposal.status === "ACCEPTED" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Akkoord ontvangen</p>
                <h2 className="mt-2 text-xl font-semibold text-emerald-950">Wij maken de opdracht tot dienstverlening voor u klaar.</h2>
                <p className="mt-3 leading-6">
                  De opdracht wordt gecontroleerd en daarna eerst door de makelaar ondertekend. Daarna ontvangt u per e-mail een uitnodiging om de opdracht digitaal te ondertekenen.
                </p>
                <p className="mt-2 leading-6">
                  Na ondertekening maken wij uw digitale klantomgeving aan op Move.nl. Bij direct starten nemen wij zo snel mogelijk contact op om de fotograaf in te plannen.
                </p>
              </>
            ) : (
              "Dit voorstel is niet meer open."
            )}
          </section>
        ) : (
          <div className="mt-5">
            <ProposalChoiceForm
              token={token}
              defaultVerkoopstart={verkoopstart}
              defaultStartdatum={dateInputValue(proposal.selectedStartdatum || project.startdatum)}
              defaultStartReden={proposal.selectedStartReden || project.startReden || ""}
              defaultSilentSale={silentSale}
              defaultRemarks={proposal.selectedRemarks || ""}
              defaultEnergielabelChoice={energielabelChoice}
              defaultEnergielabelNote={proposal.selectedEnergielabelNote || ""}
              defaultQuickscanChoice={quickscanChoice}
              defaultQuickscanNote={proposal.selectedQuickscanNote || ""}
              energielabelKosten={energielabelOfferKosten}
              quickscanKosten={quickscanKosten}
            />
          </div>
        )}

        <footer className="mt-8 border-t border-gray-200 pt-5 text-xs leading-5 text-gray-500">
          De Zoom 3-5, 3207 BX Spijkenisse · KvK 67381954 · Voorstel geldig tot {formatDate(proposal.expiresAt) || "nader bericht"}.
        </footer>
      </div>
    </main>
  );
}
