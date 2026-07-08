import { notFound } from "next/navigation";
import ProposalChoiceForm from "./ProposalChoiceForm";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";
import { VERKOOPMETHODE_LABELS } from "@/lib/projectTypes";

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

export default async function ProposalPage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proposal = await prisma.projectProposal.findUnique({
    where: { tokenHash: proposalTokenHash(token) },
    include: { project: true },
  });

  if (!proposal) notFound();

  await prisma.projectProposal.update({
    where: { id: proposal.id },
    data: {
      viewedAt: proposal.viewedAt || new Date(),
      lastViewedAt: new Date(),
      viewCount: { increment: 1 },
    },
  });

  const project = proposal.project;
  const expired = proposal.expiresAt ? proposal.expiresAt < new Date() : false;
  const unavailable = proposal.status !== "OPEN" || expired;
  const objectAdres = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ");
  const verkoopmethode = project.verkoopmethode
    ? VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode
    : "Nog te bepalen";
  const verkoopstart = proposal.selectedVerkoopstart || project.verkoopstart || "DIRECT";
  const energielabelKosten = project.kostenEnergielabel && project.kostenEnergielabel > 0 ? project.kostenEnergielabel : 0;
  const energielabelLabel = energielabelKosten > 0 ? euro(energielabelKosten) : "Al aanwezig / zelf regelen";
  const energielabelChoice = proposal.selectedEnergielabelChoice
    || (energielabelKosten > 0 ? "VIA_MAKELAAR" : "AANWEZIG_OF_ZELF");

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 flex flex-col gap-2 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">De Vree Makelaardij</p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950">Voorstel verkoopopdracht</h1>
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
                <dd className="mt-1 font-semibold text-gray-900">{project.aanvaarding || "In overleg"}</dd>
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
            </dl>
          </aside>
        </div>

        <section className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Publiciteitskosten</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Dit is het maximale budget voor de presentatie van de woning, zoals Funda, fotografie, 360 graden foto&apos;s, video en plattegronden. We brengen dit alleen in rekening volgens de afspraken in de opdracht.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Energielabel</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              We rekenen geen gratis energielabel. Als het label al geldig is of u dit zelf regelt, staat hiervoor geen kostenpost via ons. Alleen als wij het moeten regelen, nemen we daarvoor een maximum op.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Intrekking en bedenktijd</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Deze bedragen staan juridisch in de opdracht voor uitzonderingssituaties, bijvoorbeeld intrekken na gemaakte werkzaamheden of ontbinding binnen de wettelijke bedenktijd. Dit zijn geen kosten die u normaal vooraf betaalt.
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Vervolg</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Als u akkoord bent, zetten we de opdracht tot dienstverlening klaar voor ondertekening. Na het tekenen komt u terug op de website van De Vree Makelaardij.
          </p>
        </section>

        {unavailable ? (
          <section className="mt-5 rounded-lg border border-amber-100 bg-amber-50 p-5 text-sm text-amber-800">
            {expired ? "Dit voorstel is verlopen." : "Dit voorstel is niet meer open."}
            {proposal.documensoSigningUrl && (
              <a href={proposal.documensoSigningUrl} className="ml-2 font-semibold underline">
                Open ondertekenen
              </a>
            )}
          </section>
        ) : (
          <div className="mt-5">
            <ProposalChoiceForm
              token={token}
              defaultVerkoopstart={verkoopstart}
              defaultStartdatum={dateInputValue(proposal.selectedStartdatum || project.startdatum)}
              defaultStartReden={proposal.selectedStartReden || project.startReden || ""}
              defaultEnergielabelChoice={energielabelChoice}
              defaultEnergielabelNote={proposal.selectedEnergielabelNote || ""}
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
