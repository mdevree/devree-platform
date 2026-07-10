import AankoopChoiceForm from "./AankoopChoiceForm";
import ProposalTracker from "./ProposalTracker";
import { AANKOOP_WERKZAAMHEDEN, type AankoopTarieven } from "@/lib/otdAankoop";

type AankoopOpdrachtgever = {
  mauticContactId: number | null;
  naam: string;
  achternaam: string;
  email: string;
  telefoon: string;
  adres: string;
  aanhef: string;
  initialen: string;
  voornamen: string;
  geboortedatum: string;
  geboorteplaats: string;
  burgerlijkeStaat: string;
};

function euro(value: number | null | undefined) {
  if (value == null) return "Nog te bepalen";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : null;
}

export default function AankoopProposalPage({
  token,
  previewMode,
  proposalStatus,
  expiresAt,
  defaultRemarks,
  tarieven,
  opdrachtgevers,
}: {
  token: string;
  previewMode: boolean;
  proposalStatus: string;
  expiresAt: Date | null;
  defaultRemarks: string;
  tarieven: AankoopTarieven;
  opdrachtgevers: AankoopOpdrachtgever[];
}) {
  const expired = expiresAt ? expiresAt < new Date() : false;
  const unavailable = proposalStatus !== "OPEN" || expired;

  return (
    <main className="min-h-screen bg-gray-50">
      <ProposalTracker token={token} enabled={!previewMode} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-8 flex flex-col gap-2 border-b border-gray-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-800">De Vree Makelaardij</p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-950">Voorstel aankoopopdracht</h1>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Aankoopbegeleiding</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-950">{euro(tarieven.vastTarief)} incl. btw</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Dit vaste tarief geldt voor bezichtigingen en onderzoek binnen ons werkgebied en omvat maximaal {tarieven.maxWoningen} woningen.
              Voor elke woning daarboven geldt een toeslag van {euro(tarieven.toeslagExtraWoning)} incl. btw per woning.
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Ons werkgebied: {tarieven.werkgebied}. Voor bezichtigingen buiten het werkgebied maken wij vooraf aanvullende afspraken.
            </p>
          </section>

          <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Overige tarieven</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Intrekken van de opdracht</dt>
                <dd className="text-right font-medium text-gray-900">{euro(tarieven.intrekking)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Ontbinden binnen 14 dagen bedenktijd</dt>
                <dd className="text-right font-medium text-gray-900">{euro(tarieven.bedenktijd)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Aankoop niet doorzetten na geaccepteerd bod</dt>
                <dd className="text-right font-medium text-gray-900">{euro(tarieven.nietDoorzetten)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-gray-500">Alle bedragen zijn inclusief btw.</p>
          </aside>
        </div>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Wat wij voor u doen</p>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-gray-600 sm:grid-cols-2">
            {AANKOOP_WERKZAAMHEDEN.map((taak) => (
              <li key={taak} className="flex gap-2">
                <span className="text-emerald-700">✓</span>
                <span>{taak}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Vervolg</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Na uw akkoord maken wij de opdracht tot dienstverlening voor u op. Deze wordt gecontroleerd en eerst door de makelaar ondertekend. Daarna ontvangt u per e-mail een uitnodiging om de opdracht digitaal te ondertekenen.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Na ondertekening nemen wij contact met u op om uw woonwensen en de eerste stappen door te nemen.
          </p>
        </section>

        {unavailable ? (
          <section className={`mt-5 rounded-lg border p-5 text-sm ${
            proposalStatus === "ACCEPTED" && !expired
              ? "border-emerald-100 bg-emerald-50 text-emerald-900"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}>
            {expired ? (
              "Dit voorstel is verlopen."
            ) : proposalStatus === "ACCEPTED" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Akkoord ontvangen</p>
                <h2 className="mt-2 text-xl font-semibold text-emerald-950">Wij maken de opdracht tot dienstverlening voor u klaar.</h2>
                <p className="mt-3 leading-6">
                  De opdracht wordt gecontroleerd en daarna eerst door de makelaar ondertekend. Daarna ontvangt u per e-mail een uitnodiging om de opdracht digitaal te ondertekenen.
                </p>
                <p className="mt-2 leading-6">
                  Na ondertekening nemen wij contact met u op om uw woonwensen en de eerste stappen door te nemen.
                </p>
              </>
            ) : (
              "Dit voorstel is niet meer open."
            )}
          </section>
        ) : (
          <div className="mt-5">
            <AankoopChoiceForm
              token={token}
              defaultRemarks={defaultRemarks}
              opdrachtgevers={opdrachtgevers}
            />
          </div>
        )}

        <footer className="mt-8 border-t border-gray-200 pt-5 text-xs leading-5 text-gray-500">
          De Zoom 3-5, 3207 BX Spijkenisse · KvK 67381954 · Voorstel geldig tot {formatDate(expiresAt) || "nader bericht"}.
        </footer>
      </div>
    </main>
  );
}
