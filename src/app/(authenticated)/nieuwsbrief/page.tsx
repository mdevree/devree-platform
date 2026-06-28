"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CursorArrowRaysIcon,
  EnvelopeIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

type ItemStatus = "INBOX" | "GEPLAND" | "GEBRUIKT" | "GEARCHIVEERD";
type IssueStatus = "DRAFT" | "READY" | "EXPORTED";
type BlockType = "HERO" | "TEXT" | "LINK_LIST" | "CTA";

interface NewsletterItem {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  category: string | null;
  audience: string | null;
  status: ItemStatus;
  sourceHost: string | null;
  createdAt: string;
}

interface NewsletterBlock {
  id: string;
  issueId: string;
  itemId: string | null;
  type: BlockType;
  position: number;
  title: string | null;
  body: string | null;
  url: string | null;
  ctaLabel: string | null;
  item: NewsletterItem | null;
}

interface NewsletterIssue {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  status: IssueStatus;
  segmentIds: number[] | null;
  mauticEmailId: number | null;
  mauticEmailUrl: string | null;
  exportedAt: string | null;
  blocks: NewsletterBlock[];
  createdAt: string;
}

interface MauticSegment {
  id: number;
  name: string;
  alias: string | null;
  subscriberCount: number | null;
}

interface NewsletterDashboard {
  subscriberCount: number | null;
  subscriberLabel: string;
  latestIssue: {
    id: string;
    name: string;
    subject: string;
    status: string;
    mauticEmailId: number | null;
    mauticEmailUrl: string | null;
    exportedAt: string | null;
    sentCount: number | null;
    openCount: number;
    clickCount: number;
    openRate: number | null;
    clickRate: number | null;
  } | null;
}

const emptyItem = { title: "", url: "", description: "", category: "", audience: "" };
const emptyIssue = { name: "", subject: "", preheader: "", segmentIds: [] as number[] };

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("nl-NL").format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function statusLabel(status: string): string {
  if (status === "EXPORTED") return "Geexporteerd";
  if (status === "READY") return "Klaar";
  if (status === "GEPLAND") return "Gepland";
  if (status === "GEBRUIKT") return "Gebruikt";
  if (status === "GEARCHIVEERD") return "Archief";
  return "Concept";
}

export default function NieuwsbriefPage() {
  const [dashboard, setDashboard] = useState<NewsletterDashboard | null>(null);
  const [items, setItems] = useState<NewsletterItem[]>([]);
  const [issues, setIssues] = useState<NewsletterIssue[]>([]);
  const [segments, setSegments] = useState<MauticSegment[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [issueForm, setIssueForm] = useState(emptyIssue);
  const [itemSearch, setItemSearch] = useState("");
  const [itemStatus, setItemStatus] = useState<ItemStatus | "ALLE">("INBOX");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) || issues[0] || null,
    [issues, selectedIssueId]
  );

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/nieuwsbrief/dashboard");
    const data = await res.json();
    setDashboard(data);
  }, []);

  const loadSegments = useCallback(async () => {
    const res = await fetch("/api/nieuwsbrief/segments");
    const data = await res.json();
    setSegments(data.segments || []);
  }, []);

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("status", itemStatus);
    if (itemSearch.trim()) params.set("search", itemSearch.trim());
    const res = await fetch(`/api/nieuwsbrief/items?${params}`);
    const data = await res.json();
    setItems(data.items || []);
  }, [itemSearch, itemStatus]);

  const loadIssues = useCallback(async () => {
    const res = await fetch("/api/nieuwsbrief/issues");
    const data = await res.json();
    const loadedIssues = data.issues || [];
    setIssues(loadedIssues);
    setSelectedIssueId((current) => current || loadedIssues[0]?.id || null);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadDashboard(), loadSegments(), loadItems(), loadIssues()]);
    setLoading(false);
  }, [loadDashboard, loadItems, loadIssues, loadSegments]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  async function createItem() {
    if (!itemForm.title.trim()) {
      setError("Vul een titel in voor het contentitem.");
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch("/api/nieuwsbrief/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemForm),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Contentitem opslaan mislukt");
      return;
    }

    setItemForm(emptyItem);
    setMessage("Contentitem toegevoegd.");
    loadItems();
  }

  async function archiveItem(id: string) {
    await fetch(`/api/nieuwsbrief/items/${id}`, { method: "DELETE" });
    loadItems();
  }

  async function createIssue() {
    if (!issueForm.name.trim() || !issueForm.subject.trim()) {
      setError("Vul naam en onderwerp in voor de editie.");
      return;
    }

    setSaving(true);
    setError(null);
    const res = await fetch("/api/nieuwsbrief/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issueForm),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Editie aanmaken mislukt");
      return;
    }

    setIssueForm(emptyIssue);
    setSelectedIssueId(data.issue.id);
    setMessage("Editie aangemaakt.");
    loadIssues();
  }

  async function updateIssue(issue: NewsletterIssue, patch: Partial<NewsletterIssue>) {
    const res = await fetch(`/api/nieuwsbrief/issues/${issue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Editie opslaan mislukt");
      return;
    }
    setIssues((current) => current.map((entry) => (entry.id === issue.id ? data.issue : entry)));
  }

  async function addItemToIssue(item: NewsletterItem, type: BlockType = "TEXT") {
    if (!selectedIssue) {
      setError("Maak eerst een editie aan.");
      return;
    }

    const res = await fetch(`/api/nieuwsbrief/issues/${selectedIssue.id}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, type, ctaLabel: "Lees meer" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Blok toevoegen mislukt");
      return;
    }
    setMessage("Item toegevoegd aan editie.");
    await Promise.all([loadIssues(), loadItems()]);
  }

  async function addTextBlock(type: BlockType) {
    if (!selectedIssue) return;
    const res = await fetch(`/api/nieuwsbrief/issues/${selectedIssue.id}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title: type === "CTA" ? "Plan een gesprek" : "Nieuw blok", ctaLabel: "Lees meer" }),
    });
    if (res.ok) loadIssues();
  }

  async function updateBlock(block: NewsletterBlock, patch: Partial<NewsletterBlock>) {
    const res = await fetch(`/api/nieuwsbrief/blocks/${block.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) loadIssues();
  }

  async function deleteBlock(block: NewsletterBlock) {
    await fetch(`/api/nieuwsbrief/blocks/${block.id}`, { method: "DELETE" });
    loadIssues();
  }

  async function exportToMautic() {
    if (!selectedIssue) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/nieuwsbrief/issues/${selectedIssue.id}/export-mautic`, { method: "POST" });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Export naar Mautic mislukt");
      return;
    }

    setMessage(`Mautic concept aangemaakt: #${data.mauticEmailId}`);
    await Promise.all([loadDashboard(), loadIssues(), loadItems()]);
  }

  function toggleSegment(segmentId: number) {
    if (!selectedIssue) return;
    const current = selectedIssue.segmentIds || [];
    const next = current.includes(segmentId)
      ? current.filter((id) => id !== segmentId)
      : [...current, segmentId];
    updateIssue(selectedIssue, { segmentIds: next } as Partial<NewsletterIssue>);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nieuwsbrief</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verzamel links, bouw edities op en zet een concept klaar in Mautic.
          </p>
        </div>
        {selectedIssue?.mauticEmailUrl && (
          <a
            href={selectedIssue.mauticEmailUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Mautic openen
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={UserGroupIcon}
          label={dashboard?.subscriberLabel || "Abonnees"}
          value={formatNumber(dashboard?.subscriberCount)}
        />
        <KpiCard
          icon={EnvelopeIcon}
          label="Laatste nieuwsbrief"
          value={dashboard?.latestIssue?.subject || "Nog geen export"}
          small
        />
        <KpiCard
          icon={ChartBarIcon}
          label="Opens"
          value={
            dashboard?.latestIssue
              ? `${formatNumber(dashboard.latestIssue.openCount)}${dashboard.latestIssue.openRate !== null ? ` (${dashboard.latestIssue.openRate}%)` : ""}`
              : "-"
          }
        />
        <KpiCard
          icon={CursorArrowRaysIcon}
          label="Clicks"
          value={
            dashboard?.latestIssue
              ? `${formatNumber(dashboard.latestIssue.clickCount)}${dashboard.latestIssue.clickRate !== null ? ` (${dashboard.latestIssue.clickRate}%)` : ""}`
              : "-"
          }
        />
      </div>

      {(message || error) && (
        <div className={`rounded-lg px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Content toevoegen</h2>
            <div className="mt-4 space-y-3">
              <input
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                placeholder="Titel"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={itemForm.url}
                onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })}
                placeholder="https://..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Korte notitie of samenvatting"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={itemForm.category}
                  onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                  placeholder="Categorie"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={itemForm.audience}
                  onChange={(e) => setItemForm({ ...itemForm, audience: e.target.value })}
                  placeholder="Doelgroep"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                onClick={createItem}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                <PlusIcon className="h-4 w-4" />
                Item toevoegen
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Contentbank</h2>
              <select
                value={itemStatus}
                onChange={(e) => setItemStatus(e.target.value as ItemStatus | "ALLE")}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="INBOX">Inbox</option>
                <option value="GEPLAND">Gepland</option>
                <option value="GEBRUIKT">Gebruikt</option>
                <option value="GEARCHIVEERD">Archief</option>
                <option value="ALLE">Alle</option>
              </select>
            </div>
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Zoek content..."
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-400">Laden...</p>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Geen items gevonden.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                        {item.sourceHost && <p className="mt-0.5 text-xs text-gray-400">{item.sourceHost}</p>}
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{statusLabel(item.status)}</span>
                    </div>
                    {item.description && <p className="mt-2 line-clamp-2 text-xs text-gray-500">{item.description}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => addItemToIssue(item)}
                        className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Naar editie
                      </button>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
                          <LinkIcon className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => archiveItem(item.id)} className="ml-auto rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Nieuwe editie</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <input
                value={issueForm.name}
                onChange={(e) => setIssueForm({ ...issueForm, name: e.target.value })}
                placeholder="Naam intern"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={issueForm.subject}
                onChange={(e) => setIssueForm({ ...issueForm, subject: e.target.value })}
                placeholder="Onderwerpregel"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                value={issueForm.preheader}
                onChange={(e) => setIssueForm({ ...issueForm, preheader: e.target.value })}
                placeholder="Preheader"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={createIssue}
              disabled={saving}
              className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Editie maken
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Edities</h2>
              <div className="mt-4 space-y-2">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm ${
                      selectedIssue?.id === issue.id ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{issue.name}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">{issue.subject}</p>
                    <p className="mt-2 text-xs text-gray-400">{statusLabel(issue.status)} · {formatDate(issue.exportedAt || issue.createdAt)}</p>
                  </button>
                ))}
                {!issues.length && <p className="py-8 text-center text-sm text-gray-400">Nog geen edities.</p>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {selectedIssue ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedIssue.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">{selectedIssue.subject}</p>
                    </div>
                    <button
                      onClick={exportToMautic}
                      disabled={saving || !selectedIssue.segmentIds?.length}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      Concept naar Mautic
                    </button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <input
                      key={`${selectedIssue.id}-name`}
                      defaultValue={selectedIssue.name}
                      onBlur={(e) => updateIssue(selectedIssue, { name: e.target.value } as Partial<NewsletterIssue>)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      key={`${selectedIssue.id}-subject`}
                      defaultValue={selectedIssue.subject}
                      onBlur={(e) => updateIssue(selectedIssue, { subject: e.target.value } as Partial<NewsletterIssue>)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      key={`${selectedIssue.id}-preheader`}
                      defaultValue={selectedIssue.preheader || ""}
                      onBlur={(e) => updateIssue(selectedIssue, { preheader: e.target.value } as Partial<NewsletterIssue>)}
                      placeholder="Preheader"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Mautic segmenten</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {segments.map((segment) => (
                        <label key={segment.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedIssue.segmentIds?.includes(segment.id))}
                            onChange={() => toggleSegment(segment.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="min-w-0 flex-1 truncate text-gray-700">{segment.name}</span>
                          <span className="text-xs text-gray-400">{formatNumber(segment.subscriberCount)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => addTextBlock("HERO")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Hoofdblok</button>
                    <button onClick={() => addTextBlock("TEXT")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">Tekstblok</button>
                    <button onClick={() => addTextBlock("CTA")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">CTA</button>
                  </div>

                  <div className="space-y-3">
                    {selectedIssue.blocks.map((block) => (
                      <div key={block.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <select
                            value={block.type}
                            onChange={(e) => updateBlock(block, { type: e.target.value as BlockType } as Partial<NewsletterBlock>)}
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                          >
                            <option value="HERO">Hoofdblok</option>
                            <option value="TEXT">Tekst</option>
                            <option value="LINK_LIST">Link</option>
                            <option value="CTA">CTA</option>
                          </select>
                          <input
                            type="number"
                            value={block.position}
                            onChange={(e) => updateBlock(block, { position: Number(e.target.value) } as Partial<NewsletterBlock>)}
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                          />
                          <button onClick={() => deleteBlock(block)} className="ml-auto rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <input
                          defaultValue={block.title || ""}
                          onBlur={(e) => updateBlock(block, { title: e.target.value } as Partial<NewsletterBlock>)}
                          placeholder="Titel"
                          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <textarea
                          defaultValue={block.body || ""}
                          onBlur={(e) => updateBlock(block, { body: e.target.value } as Partial<NewsletterBlock>)}
                          placeholder="Tekst"
                          rows={3}
                          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                          <input
                            defaultValue={block.url || ""}
                            onBlur={(e) => updateBlock(block, { url: e.target.value } as Partial<NewsletterBlock>)}
                            placeholder="URL"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <input
                            defaultValue={block.ctaLabel || ""}
                            onBlur={(e) => updateBlock(block, { ctaLabel: e.target.value } as Partial<NewsletterBlock>)}
                            placeholder="Knoptekst"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      </div>
                    ))}
                    {!selectedIssue.blocks.length && (
                      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
                        Voeg contentitems of blokken toe om deze editie op te bouwen.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-sm text-gray-400">Maak een editie aan om te beginnen.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  small = false,
}: {
  icon: typeof UserGroupIcon;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
          <p className={`${small ? "truncate text-sm" : "text-xl"} mt-1 font-semibold text-gray-900`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
