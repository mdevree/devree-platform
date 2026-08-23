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
  VideoCameraIcon,
  EyeIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
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

type MauticContactOption = {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

type AppointmentConfirmation = {
  id: string;
  status: string;
  publicUrl: string | null;
  previewUrl: string | null;
  woningUrl: string | null;
  whatsappBody: string;
  videoPath: string | null;
  videoOriginalName: string | null;
  sentAt: string | null;
  openedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  videoStartCount: number;
  videoCompleteCount: number;
  confirmedAt: string | null;
  cancelledAt: string | null;
  deliveryError: string | null;
  events?: Array<{ id: string; eventType: string; createdAt: string }>;
};

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
  const [toonMauticZoeker, setToonMauticZoeker] = useState(false);
  const [mauticZoekterm, setMauticZoekterm] = useState("");
  const [mauticResultaten, setMauticResultaten] = useState<MauticContactOption[]>([]);
  const [mauticZoekt, setMauticZoekt] = useState(false);
  const [mauticKoppelt, setMauticKoppelt] = useState<number | null>(null);
  const [mauticMelding, setMauticMelding] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<AppointmentConfirmation | null>(null);
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [confirmationBusy, setConfirmationBusy] = useState<"create" | "upload" | "send" | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

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

  const laadConfirmation = useCallback(async () => {
    setConfirmationLoading(true);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/appointment-confirmation`);
      if (!res.ok) return;
      const data = await res.json();
      setConfirmation(data.confirmation || null);
    } finally {
      setConfirmationLoading(false);
    }
  }, [afspraakId]);

  useEffect(() => {
    laadConfirmation();
  }, [laadConfirmation]);

  async function maakConfirmation() {
    setConfirmationBusy("create");
    setConfirmationMessage(null);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/appointment-confirmation`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmationMessage(data.error || "Bevestiging maken mislukt.");
        return;
      }
      setConfirmation(data.confirmation);
      setConfirmationMessage("Bevestigingslink klaar. Controleer de preview en upload de video.");
    } catch {
      setConfirmationMessage("Bevestiging maken mislukt.");
    } finally {
      setConfirmationBusy(null);
    }
  }

  async function uploadConfirmationVideo(file: File | null) {
    if (!file) return;
    setConfirmationBusy("upload");
    setConfirmationMessage(null);
    try {
      const formData = new FormData();
      formData.set("video", file);
      const res = await fetch(`/api/agenda/${afspraakId}/appointment-confirmation/video`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmationMessage(data.error || "Video uploaden mislukt.");
        return;
      }
      setConfirmation(data.confirmation);
      setConfirmationMessage("Video toegevoegd. Open de preview om te controleren.");
    } catch {
      setConfirmationMessage("Video uploaden mislukt.");
    } finally {
      setConfirmationBusy(null);
    }
  }

  async function verstuurConfirmation() {
    setConfirmationBusy("send");
    setConfirmationMessage(null);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/appointment-confirmation/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfirmation(data.confirmation || confirmation);
        setConfirmationMessage(data.error || "WhatsApp verzenden mislukt.");
        return;
      }
      setConfirmation(data.confirmation);
      setConfirmationMessage("WhatsApp-bevestiging verzonden.");
    } catch {
      setConfirmationMessage("WhatsApp verzenden mislukt.");
    } finally {
      setConfirmationBusy(null);
    }
  }

  async function kopieerConfirmationLink() {
    if (!confirmation?.publicUrl) return;
    await navigator.clipboard?.writeText(confirmation.publicUrl).catch(() => {});
    setConfirmationMessage("Link gekopieerd.");
  }

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

  async function zoekMauticContacten() {
    const q = mauticZoekterm.trim();
    if (q.length < 2) {
      setMauticResultaten([]);
      setMauticMelding("Vul minimaal 2 tekens in.");
      return;
    }
    setMauticZoekt(true);
    setMauticMelding(null);
    try {
      const res = await fetch(`/api/mautic/contacts?search=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMauticMelding(data.error || "Zoeken in Mautic mislukt.");
        return;
      }
      setMauticResultaten(data.contacts || []);
      if (!data.contacts?.length) setMauticMelding("Geen contacten gevonden.");
    } catch {
      setMauticMelding("Zoeken in Mautic mislukt.");
    } finally {
      setMauticZoekt(false);
    }
  }

  async function kiesMauticContact(contactId: number) {
    setMauticKoppelt(contactId);
    setMauticMelding(null);
    try {
      const res = await fetch(`/api/agenda/${afspraakId}/mautic-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMauticMelding(data.error || "Koppelen mislukt.");
        return;
      }
      setToonMauticZoeker(false);
      setMauticZoekterm("");
      setMauticResultaten([]);
      await laad();
      onGekoppeld?.();
    } catch {
      setMauticMelding("Koppelen mislukt.");
    } finally {
      setMauticKoppelt(null);
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
              <button
                onClick={() => {
                  setToonMauticZoeker((open) => !open);
                  setMauticMelding(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                <UserPlusIcon className="h-4 w-4" />
                Kies Mautic-contact
              </button>
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

            <section className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Persoonlijke bevestiging</h3>
                  <p className="mt-1 text-xs text-gray-600">
                    WhatsApp-link met video, bevestigen/annuleren en tracking voor deze bezichtiging.
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-700">
                  {confirmationLoading ? "Laadt..." : confirmation?.status || "nog niet gemaakt"}
                </span>
              </div>

              {!confirmation ? (
                <button
                  onClick={maakConfirmation}
                  disabled={confirmationBusy !== null}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <VideoCameraIcon className="h-4 w-4" />
                  {confirmationBusy === "create" ? "Maakt..." : "Bevestiging maken"}
                </button>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <p className="font-medium text-gray-900">{confirmation.openCount}</p>
                      <p>openingen</p>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <p className="font-medium text-gray-900">{confirmation.videoStartCount}</p>
                      <p>video gestart</p>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <p className="font-medium text-gray-900">{confirmation.videoCompleteCount}</p>
                      <p>video af</p>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5">
                      <p className="font-medium text-gray-900">
                        {confirmation.confirmedAt ? "ja" : confirmation.cancelledAt ? "annulering" : "nee"}
                      </p>
                      <p>reactie</p>
                    </div>
                  </div>

                  {confirmation.publicUrl && (
                    <p className="truncate rounded-md bg-white px-2 py-1.5 text-xs text-gray-600">
                      {confirmation.publicUrl}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">
                      <VideoCameraIcon className="h-4 w-4" />
                      {confirmationBusy === "upload" ? "Uploadt..." : confirmation.videoPath ? "Vervang MP4" : "Upload MP4"}
                      <input
                        type="file"
                        accept="video/mp4"
                        className="hidden"
                        disabled={confirmationBusy !== null}
                        onChange={(event) => uploadConfirmationVideo(event.target.files?.[0] || null)}
                      />
                    </label>
                    {confirmation.previewUrl && (
                      <a
                        href={confirmation.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                      >
                        <EyeIcon className="h-4 w-4" />
                        Preview
                      </a>
                    )}
                    {confirmation.publicUrl && (
                      <button
                        onClick={kopieerConfirmationLink}
                        className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                      >
                        <ClipboardDocumentIcon className="h-4 w-4" />
                        Link kopiëren
                      </button>
                    )}
                    <button
                      onClick={verstuurConfirmation}
                      disabled={confirmationBusy !== null || !confirmation.videoPath}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {confirmationBusy === "send" ? "Verstuurt..." : "WhatsApp sturen"}
                    </button>
                  </div>

                  {confirmation.videoOriginalName && (
                    <p className="text-xs text-gray-600">Video: {confirmation.videoOriginalName}</p>
                  )}
                  {confirmation.woningUrl && (
                    <a href={confirmation.woningUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                      Specifieke woningpagina controleren
                    </a>
                  )}
                </div>
              )}

              {(confirmationMessage || confirmation?.deliveryError) && (
                <p className={`mt-3 text-xs ${confirmation?.deliveryError ? "text-red-600" : "text-gray-600"}`}>
                  {confirmationMessage || confirmation?.deliveryError}
                </p>
              )}
            </section>

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

            {toonMauticZoeker && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex gap-2">
                  <input
                    value={mauticZoekterm}
                    onChange={(event) => setMauticZoekterm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") zoekMauticContacten();
                    }}
                    placeholder="Zoek Mautic-contact op naam, e-mail of telefoon"
                    className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={zoekMauticContacten}
                    disabled={mauticZoekt}
                    className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {mauticZoekt ? "Zoekt..." : "Zoek"}
                  </button>
                </div>
                {mauticMelding && <p className="mt-2 text-xs text-gray-600">{mauticMelding}</p>}
                {mauticResultaten.length > 0 && (
                  <ul className="mt-3 divide-y divide-blue-100 rounded-md border border-blue-100 bg-white">
                    {mauticResultaten.map((contact) => {
                      const naam = `${contact.firstname || ""} ${contact.lastname || ""}`.trim() || "Naamloos contact";
                      const telefoon = contact.mobile || contact.phone;
                      return (
                        <li key={contact.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-gray-900">{naam}</p>
                            <p className="truncate text-xs text-gray-500">
                              #{contact.id}
                              {contact.email ? ` · ${contact.email}` : ""}
                              {telefoon ? ` · ${telefoon}` : ""}
                            </p>
                          </div>
                          <button
                            onClick={() => kiesMauticContact(contact.id)}
                            disabled={mauticKoppelt !== null}
                            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                          >
                            {mauticKoppelt === contact.id ? "Koppelt..." : "Kies"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
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
