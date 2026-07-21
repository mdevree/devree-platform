"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  ExclamationTriangleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

type ProjectBase = {
  id: string;
  name: string;
  type: string;
  status: string;
  address: string | null;
  mauticContactIds: number[];
  updatedAt: string;
};

type DebiteurenControle = {
  checkedAt: string;
  summary: {
    activeProjects: number;
    linkedProjects: number;
    unlinkedWithMautic: number;
    linksWithWarnings: number;
    reviewedLinksWithWarnings: number;
    taxatieReadyForInvoice: number;
    platformInvoices: number;
  };
  linksWithWarnings: LinkWarningItem[];
  reviewedLinksWithWarnings: LinkWarningItem[];
  unlinkedWithMautic: ProjectBase[];
  taxatieReadyForInvoice: Array<ProjectBase & {
    link: { debiteurenKlantId: number | null; klantNaam: string | null };
  }>;
  recentInvoices: Array<ProjectBase & {
    invoice: {
      id: string;
      debiteurenFactuurId: number;
      factuurnummer: number | null;
      invoiceType: string;
      amountIncl: number;
      createdAt: string;
    };
  }>;
};

type LinkWarningItem = ProjectBase & {
    link: {
      id: string;
      debiteurenKlantId: number;
      klantNaam: string | null;
      klantEmail: string | null;
      klantAdres: string | null;
      mauticContactId: number | null;
      normalizationCheckedAt: string | null;
      review: {
        reviewedAt: string;
        reviewedBy: string | null;
        note: string | null;
      } | null;
    };
    warnings: Array<{ code: string; field: string | null; message: string }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
}

function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" | "good" }) {
  const toneClass = tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function projectDebiteurenHref(projectId: string) {
  return `/projecten/${projectId}?focus=debiteuren`;
}

function ProjectLink({ project }: { project: ProjectBase }) {
  return (
    <div className="min-w-0">
      <Link href={projectDebiteurenHref(project.id)} className="font-medium text-gray-900 hover:text-primary hover:underline">
        {project.name}
      </Link>
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {project.type} · {project.status}{project.address ? ` · ${project.address}` : ""}
      </p>
      {project.mauticContactIds.length > 0 && (
        <p className="mt-0.5 text-xs text-gray-400">
          Mautic: {project.mauticContactIds.join(", ")}
        </p>
      )}
      <Link href={projectDebiteurenHref(project.id)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Open facturatieblok
        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function DebiteurenControlePage() {
  const [data, setData] = useState<DebiteurenControle | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingLinkId, setReviewingLinkId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/debiteuren/controle");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Debiteurencontrole kon niet worden geladen");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markWarningReviewed(linkId: string) {
    const note = window.prompt("Optionele notitie bij deze adrescheck:", "");
    if (note === null) return;

    setReviewingLinkId(linkId);
    setError("");
    try {
      const res = await fetch(`/api/debiteuren/controle/warnings/${encodeURIComponent(linkId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Adrescheck kon niet worden afgehandeld");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setReviewingLinkId(null);
    }
  }

  const needsAttention = useMemo(() => {
    if (!data) return 0;
    return data.summary.unlinkedWithMautic + data.summary.linksWithWarnings + data.summary.taxatieReadyForInvoice;
  }, [data]);

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Debiteurencontrole laden...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debiteurencontrole</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Centrale controle op Mautic-adresnormalisatie, projectkoppelingen en taxatiefacturen.
          </p>
          {data?.checkedAt && (
            <p className="mt-2 text-xs text-gray-400">Laatst gecontroleerd: {fmtDate(data.checkedAt)}</p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Ververs
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Actieve projecten" value={data.summary.activeProjects} />
            <Stat label="Gekoppeld" value={data.summary.linkedProjects} tone="good" />
            <Stat label="Zonder link" value={data.summary.unlinkedWithMautic} tone={data.summary.unlinkedWithMautic ? "warn" : "good"} />
            <Stat label="Adreschecks" value={data.summary.linksWithWarnings} tone={data.summary.linksWithWarnings ? "warn" : "good"} />
            <Stat label="Taxatie klaar" value={data.summary.taxatieReadyForInvoice} tone={data.summary.taxatieReadyForInvoice ? "warn" : "good"} />
            <Stat label="Aandacht" value={needsAttention} tone={needsAttention ? "warn" : "good"} />
          </div>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="font-semibold text-gray-900">Adresnormalisatie controleren</h2>
                <p className="text-xs text-gray-500">Mautic-koppelingen waarbij het platform iets moest interpreteren of signaleren.</p>
              </div>
            </div>
            {data.linksWithWarnings.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-500">Geen opgeslagen adreswaarschuwingen.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.linksWithWarnings.map((item) => (
                  <div key={item.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_1.2fr]">
                    <ProjectLink project={item} />
                    <div className="space-y-3">
                      <div className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <p className="font-semibold">{item.link.klantNaam || `Klant #${item.link.debiteurenKlantId}`}</p>
                        {item.warnings.map((warning, index) => (
                          <p key={`${warning.code}-${index}`}>
                            {warning.message}{warning.field ? ` (${warning.field})` : ""}
                          </p>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => markWarningReviewed(item.link.id)}
                        disabled={reviewingLinkId === item.link.id}
                        className="inline-flex items-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        {reviewingLinkId === item.link.id ? "Opslaan..." : "Markeer gecontroleerd"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.reviewedLinksWithWarnings.length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Gecontroleerd ({data.summary.reviewedLinksWithWarnings})
                </p>
                <div className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
                  {data.reviewedLinksWithWarnings.map((item) => (
                    <div key={item.id} className="grid gap-2 px-3 py-2 text-xs lg:grid-cols-[1fr_1.2fr]">
                      <ProjectLink project={item} />
                      <div className="text-gray-600">
                        <p>
                          Afgehandeld op {fmtDate(item.link.review?.reviewedAt)}
                          {item.link.review?.reviewedBy ? ` door ${item.link.review.reviewedBy}` : ""}
                        </p>
                        {item.link.review?.note && (
                          <p className="mt-1 italic text-gray-500">{item.link.review.note}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <LinkIcon className="h-5 w-5 text-gray-500" />
              <div>
                <h2 className="font-semibold text-gray-900">Projecten met Mautic-contact maar zonder debiteurenlink</h2>
                <p className="text-xs text-gray-500">Deze projecten kunnen via de projectkaart worden aangemaakt of gekoppeld vanuit Mautic.</p>
              </div>
            </div>
            {data.unlinkedWithMautic.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-500">Geen openstaande Mautic-projecten zonder debiteurenlink.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.unlinkedWithMautic.map((project) => (
                  <div key={project.id} className="px-4 py-3">
                    <ProjectLink project={project} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <BanknotesIcon className="h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="font-semibold text-gray-900">Taxatieprojecten klaar voor factuur</h2>
                <p className="text-xs text-gray-500">Taxatieprojecten met debiteurenlink, maar zonder platform-aangemaakte taxatiefactuur.</p>
              </div>
            </div>
            {data.taxatieReadyForInvoice.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-500">Geen gekoppelde taxatieprojecten zonder platformfactuur.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.taxatieReadyForInvoice.map((project) => (
                  <div key={project.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <ProjectLink project={project} />
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {project.link.klantNaam || `Klant #${project.link.debiteurenKlantId}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <BanknotesIcon className="h-5 w-5 text-gray-500" />
              <div>
                <h2 className="font-semibold text-gray-900">Recent via platform aangemaakte facturen</h2>
                <p className="text-xs text-gray-500">Controlepunt voor de nieuwe project-naar-debiteuren factuurworkflow.</p>
              </div>
            </div>
            {data.recentInvoices.length === 0 ? (
              <p className="px-4 py-5 text-sm text-gray-500">Nog geen facturen via het platform aangemaakt.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentInvoices.map((item) => (
                  <div key={item.invoice.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <ProjectLink project={item} />
                    <div className="shrink-0 text-right text-sm">
                      <p className="font-semibold text-gray-900">
                        #{item.invoice.factuurnummer || item.invoice.debiteurenFactuurId} · {fmtCurrency(item.invoice.amountIncl)}
                      </p>
                      <a
                        href={`/api/debiteuren/login?returnTo=${encodeURIComponent(`/?page=facturen&action=bekijk&id=${item.invoice.debiteurenFactuurId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Open factuur
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
