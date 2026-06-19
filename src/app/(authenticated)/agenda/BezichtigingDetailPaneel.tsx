"use client";

import { useEffect, useState, useCallback } from "react";
import {
  XMarkIcon,
  DocumentArrowDownIcon,
  UserPlusIcon,
  ArrowTopRightOnSquareIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

// ── Types (deelverzameling van /api/agenda/[id]/context) ─────────────────────

interface ContextResponse {
  afspraak: {
    id: string;
    begin: string | null;
    eind: string | null;
    type: string | null;
    omschrijving: string | null;
    locatie: string | null;
    memo: string | null;
    medewerker: string | null;
    contactNaam: string | null;
    contactEmail: string | null;
    contactTelefoon: string | null;
    leadId: string | null;
    cheatsheetStatus: string | null;
    cheatsheetUrl: string | null;
  };
  kijker: {
    naam: string;
    email: string | null;
    telefoon: string | null;
    tags: string[] | null;
    aiAnalyse: {
      huidigeSituatie: string | null;
      woningMotivatie: string | null;
      budgetIndicatie: string | null;
      tijdlijn: string | null;
      gezinssituatie: string | null;
      leefstijlVoorkeur: string | null;
    };
    bezichtiging: {
      notities: string | null;
      interesseScore: number | null;
      contactType: string | null;
    };
    kwalificatie: {
      heeftEigenWoning: boolean | null;
      overwegtVerkoop: boolean | null;
      hypotheekStatus: string | null;
      aanvragerType: string | null;
      leadHerkomst: string | null;
    };
  } | null;
  woning: {
    titel: string | null;
    link: string | null;
    foto: string | null;
    adres: string | null;
    prijs: { koopsom: number | null; koopprijsLabel: string | null };
    kenmerken: {
      woonoppervlakte: number | null;
      kamers: number | null;
      bouwjaar: string | null;
      energieklasse: string | null;
    };
    teksten: { aanbiedingstekst: string | null };
  } | null;
  contactHistorie: Array<{
    datum: string | null;
    type: string | null;
    omschrijving: string | null;
    medewerker: string | null;
  }>;
  project: { id: string; naam: string } | null;
}

function formatDatumTijd(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function jaNee(v: boolean | null): string {
  if (v === null || v === undefined) return "—";
  return v ? "Ja" : "Nee";
}

function Veld({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  if (waarde === null || waarde === undefined || waarde === "" || waarde === "—") return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">{waarde}</dd>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BezichtigingDetailPaneel({
  afspraakId,
  onClose,
  onGekoppeld,
}: {
  afspraakId: string;
  onClose: () => void;
  onGekoppeld?: () => void;
}) {
  const [ctx, setCtx] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [pdfBezig, setPdfBezig] = useState(false);
  const [pdfMelding, setPdfMelding] = useState<string | null>(null);
  const [koppelBezig, setKoppelBezig] = useState(false);
  const [verwijderBezig, setVerwijderBezig] = useState(false);

  const laad = useCallback(async () => {
    setLoading(true);
    setFout(null);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/context`);
      if (!res.ok) {
        setFout("Kon de bezichtiging-context niet laden.");
        return;
      }
      setCtx(await res.json());
    } catch {
      setFout("Kon de bezichtiging-context niet laden.");
    } finally {
      setLoading(false);
    }
  }, [afspraakId]);

  useEffect(() => {
    laad();
  }, [laad]);

  async function genereerPdf() {
    setPdfBezig(true);
    setPdfMelding(null);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/cheatsheet`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPdfMelding("PDF gegenereerd en opgeslagen in Nextcloud.");
        laad();
      } else {
        setPdfMelding(data.error || "Genereren mislukt.");
      }
    } catch {
      setPdfMelding("Kon PDF niet genereren.");
    } finally {
      setPdfBezig(false);
    }
  }

  async function koppelKijker() {
    setKoppelBezig(true);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/lead`, { method: "POST" });
      if (res.ok) {
        await laad();
        onGekoppeld?.();
      }
    } finally {
      setKoppelBezig(false);
    }
  }

  async function verwijder() {
    if (!confirm("Deze bezichtiging verwijderen uit het platform? De gekoppelde kijker blijft bestaan.")) {
      return;
    }
    setVerwijderBezig(true);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}`, { method: "DELETE" });
      if (res.ok) {
        onGekoppeld?.();
        onClose();
      } else {
        setVerwijderBezig(false);
      }
    } catch {
      setVerwijderBezig(false);
    }
  }

  const a = ctx?.afspraak;
  const k = ctx?.kijker;
  const w = ctx?.woning;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Paneel */}
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        {/* Kop */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {a?.contactNaam || k?.naam || "Bezichtiging"}
            </h2>
            <p className="text-sm text-gray-500">
              {w?.titel || ctx?.project?.naam || "Woning"} · {formatDatumTijd(a?.begin ?? null)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : fout ? (
          <div className="p-6 text-sm text-red-600">{fout}</div>
        ) : (
          <div className="flex flex-col gap-6 px-6 py-5">
            {/* Acties */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={genereerPdf}
                disabled={pdfBezig}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {pdfBezig ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <DocumentArrowDownIcon className="h-4 w-4" />
                )}
                Genereer PDF
              </button>

              {!a?.leadId && (
                <button
                  onClick={koppelKijker}
                  disabled={koppelBezig}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                >
                  <UserPlusIcon className="h-4 w-4" />
                  Koppel als kijker
                </button>
              )}
              {a?.leadId && (
                <a
                  href={`/leads?leadId=${a.leadId}`}
                  className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  Naar leadprofiel
                </a>
              )}
              {ctx?.project && (
                <a
                  href={`/projecten/${ctx.project.id}`}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  <BuildingOfficeIcon className="h-4 w-4" />
                  Naar woning
                </a>
              )}
              <button
                onClick={verwijder}
                disabled={verwijderBezig}
                title="Verwijder deze bezichtiging uit het platform"
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                {verwijderBezig ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                ) : (
                  <TrashIcon className="h-4 w-4" />
                )}
                Verwijderen
              </button>
            </div>

            {(pdfMelding || a?.cheatsheetStatus) && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {pdfMelding && <p>{pdfMelding}</p>}
                {a?.cheatsheetStatus && (
                  <p>
                    Cheatsheet-status: <span className="font-medium">{a.cheatsheetStatus}</span>
                    {a.cheatsheetUrl && (
                      <>
                        {" · "}
                        <a href={a.cheatsheetUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          Download PDF
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Woning */}
            {w && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Woning</h3>
                <div className="flex gap-3">
                  {w.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.foto} alt="Woning" className="h-24 w-32 flex-shrink-0 rounded-lg object-cover" />
                  )}
                  <dl className="grid flex-1 grid-cols-2 gap-2">
                    <Veld label="Adres" waarde={w.adres} />
                    <Veld
                      label="Vraagprijs"
                      waarde={w.prijs.koopsom ? `€ ${w.prijs.koopsom.toLocaleString("nl-NL")}` : w.prijs.koopprijsLabel}
                    />
                    <Veld label="Woonoppervlak" waarde={w.kenmerken.woonoppervlakte ? `${w.kenmerken.woonoppervlakte} m²` : null} />
                    <Veld label="Kamers" waarde={w.kenmerken.kamers} />
                    <Veld label="Bouwjaar" waarde={w.kenmerken.bouwjaar} />
                    <Veld label="Energieklasse" waarde={w.kenmerken.energieklasse} />
                  </dl>
                </div>
                {w.link && (
                  <a href={w.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-primary underline">
                    Bekijk op website
                  </a>
                )}
              </section>
            )}

            {/* Kijker */}
            {k ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Kijker</h3>
                <div className="mb-3 flex flex-wrap gap-3 text-sm text-gray-600">
                  {k.email && (
                    <a href={`mailto:${k.email}`} className="flex items-center gap-1 hover:text-primary">
                      <EnvelopeIcon className="h-4 w-4" /> {k.email}
                    </a>
                  )}
                  {k.telefoon && (
                    <a href={`tel:${k.telefoon}`} className="flex items-center gap-1 hover:text-primary">
                      <PhoneIcon className="h-4 w-4" /> {k.telefoon}
                    </a>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-2">
                  <Veld label="Interesse-score" waarde={k.bezichtiging.interesseScore != null ? `${k.bezichtiging.interesseScore}/100` : null} />
                  <Veld label="Type bezichtiger" waarde={k.bezichtiging.contactType} />
                  <Veld label="Eigen woning" waarde={jaNee(k.kwalificatie.heeftEigenWoning)} />
                  <Veld label="Overweegt verkoop" waarde={jaNee(k.kwalificatie.overwegtVerkoop)} />
                  <Veld label="Hypotheekstatus" waarde={k.kwalificatie.hypotheekStatus} />
                  <Veld label="Aanvrager-type" waarde={k.kwalificatie.aanvragerType} />
                  <Veld label="Lead-herkomst" waarde={k.kwalificatie.leadHerkomst} />
                </dl>
                {k.bezichtiging.notities && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-400">Notities bezichtiging</p>
                    <p className="text-sm text-gray-700">{k.bezichtiging.notities}</p>
                  </div>
                )}
                {/* AI-analyse */}
                {Object.values(k.aiAnalyse).some(Boolean) && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <p className="mb-1 text-xs font-semibold text-gray-500">AI-analyse</p>
                    <dl className="grid grid-cols-1 gap-1.5">
                      <Veld label="Huidige situatie" waarde={k.aiAnalyse.huidigeSituatie} />
                      <Veld label="Woningmotivatie" waarde={k.aiAnalyse.woningMotivatie} />
                      <Veld label="Budgetindicatie" waarde={k.aiAnalyse.budgetIndicatie} />
                      <Veld label="Tijdlijn" waarde={k.aiAnalyse.tijdlijn} />
                      <Veld label="Gezinssituatie" waarde={k.aiAnalyse.gezinssituatie} />
                      <Veld label="Leefstijlvoorkeur" waarde={k.aiAnalyse.leefstijlVoorkeur} />
                    </dl>
                  </div>
                )}
              </section>
            ) : (
              <p className="text-sm text-gray-400">Nog geen Mautic-contact gekoppeld. Gebruik &ldquo;Meer info&rdquo; in de agenda om te verrijken.</p>
            )}

            {/* Historie */}
            {ctx && ctx.contactHistorie.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Eerder contact</h3>
                <ul className="flex flex-col gap-1.5">
                  {ctx.contactHistorie.map((h, i) => (
                    <li key={i} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                      <span className="font-medium">{formatDatumTijd(h.datum)}</span>
                      {h.type && ` · ${h.type}`}
                      {h.omschrijving && ` — ${h.omschrijving}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
