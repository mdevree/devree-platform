"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PencilIcon,
  CheckCircleIcon,
  NoSymbolIcon,
  TrashIcon,
  MegaphoneIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";

/* ── Types ─────────────────────────────────────────────────── */

interface Project {
  id: string;
  name: string;
  woningAdres: string | null;
  woningPlaats: string | null;
}

interface FacebookTrigger {
  id: string;
  postId: string;
  keyword: string;
  dmTekst: string;
  actief: boolean;
  projectId: string | null;
  project: Project | null;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  postId: "",
  keyword: "",
  dmTekst: "",
  projectId: "",
};

/* ── Component ─────────────────────────────────────────────── */

export default function FacebookTriggersPage() {
  const [triggers, setTriggers] = useState<FacebookTrigger[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterActief, setFilterActief] = useState<"alle" | "actief" | "inactief">("actief");

  const [selected, setSelected] = useState<FacebookTrigger | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTriggers = useCallback(async () => {
    setLoading(true);
    const params = filterActief !== "alle" ? `?actief=${filterActief === "actief"}` : "";
    const res = await fetch(`/api/facebook-triggers${params}`);
    const data = await res.json();
    setTriggers(data.triggers ?? []);
    setLoading(false);
  }, [filterActief]);

  useEffect(() => { fetchTriggers(); }, [fetchTriggers]);

  useEffect(() => {
    fetch("/api/projecten?limit=200")
      .then(r => r.json())
      .then(data => setProjects(data.projecten ?? []));
  }, []);

  const filtered = triggers.filter(t =>
    t.keyword.includes(search.toLowerCase()) ||
    t.postId.includes(search) ||
    t.project?.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Create ── */
  async function handleCreate() {
    if (!newForm.postId || !newForm.keyword || !newForm.dmTekst) {
      setError("Vul postId, keyword en DM-tekst in.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/facebook-triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newForm,
          projectId: newForm.projectId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Fout bij aanmaken");
        return;
      }
      setShowNew(false);
      setNewForm(emptyForm);
      fetchTriggers();
    } finally {
      setSaving(false);
    }
  }

  /* ── Update ── */
  async function handleUpdate() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facebook-triggers/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          projectId: editForm.projectId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Fout bij opslaan");
        return;
      }
      const data = await res.json();
      setSelected(data.trigger);
      setEditing(false);
      fetchTriggers();
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle actief ── */
  async function handleToggleActief(trigger: FacebookTrigger) {
    await fetch(`/api/facebook-triggers/${trigger.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actief: !trigger.actief }),
    });
    if (selected?.id === trigger.id) {
      setSelected(prev => prev ? { ...prev, actief: !prev.actief } : null);
    }
    fetchTriggers();
  }

  /* ── Delete ── */
  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je deze trigger wilt verwijderen?")) return;
    await fetch(`/api/facebook-triggers/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    fetchTriggers();
  }

  function openEdit(t: FacebookTrigger) {
    setEditForm({
      postId: t.postId,
      keyword: t.keyword,
      dmTekst: t.dmTekst,
      projectId: t.projectId ?? "",
    });
    setEditing(true);
    setError(null);
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="flex h-full gap-6">
      {/* Linker kolom */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Facebook Triggers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Beheer keyword-triggers voor automatische DMs via Facebook.
            </p>
          </div>
          <button
            onClick={() => { setShowNew(true); setError(null); setNewForm(emptyForm); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <PlusIcon className="h-4 w-4" />
            Nieuwe trigger
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Zoek op keyword, post-ID of project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={filterActief}
            onChange={e => setFilterActief(e.target.value as typeof filterActief)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="actief">Actief</option>
            <option value="inactief">Inactief</option>
            <option value="alle">Alle</option>
          </select>
        </div>

        {/* Lijst */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-gray-400 text-sm">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <MegaphoneIcon className="h-12 w-12" />
            <p className="text-sm">Geen triggers gevonden.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelected(t); setEditing(false); setError(null); }}
                className={`rounded-xl border p-4 text-left transition-shadow hover:shadow-md ${
                  selected?.id === t.id
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-gray-200 bg-white shadow-sm"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 font-mono">
                    {t.keyword}
                  </span>
                  {t.actief ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Actief</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactief</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-mono truncate">Post: {t.postId}</p>
                {t.project && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                    <FolderIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    {t.project.name}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 text-xs text-gray-500">{t.dmTekst}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail sidepanel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1" />
          <div
            className="flex h-full w-full max-w-md flex-col overflow-auto bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Trigger details</h2>
              <div className="flex items-center gap-2">
                {!editing && (
                  <button
                    onClick={() => openEdit(selected)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Bewerken
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {editing ? (
                /* Edit form */
                <div className="space-y-4">
                  {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Facebook Post ID</label>
                    <input
                      value={editForm.postId}
                      onChange={e => setEditForm(f => ({ ...f, postId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Keyword</label>
                    <input
                      value={editForm.keyword}
                      onChange={e => setEditForm(f => ({ ...f, keyword: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">DM-tekst</label>
                    <textarea
                      rows={6}
                      value={editForm.dmTekst}
                      onChange={e => setEditForm(f => ({ ...f, dmTekst: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Gekoppeld project (optioneel)</label>
                    <select
                      value={editForm.projectId}
                      onChange={e => setEditForm(f => ({ ...f, projectId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">— Geen project —</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.woningPlaats ? ` · ${p.woningPlaats}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleUpdate}
                      disabled={saving}
                      className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                    >
                      {saving ? "Opslaan..." : "Opslaan"}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setError(null); }}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Annuleren
                    </button>
                  </div>
                </div>
              ) : (
                /* Detail view */
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</p>
                    <div className="mt-1">
                      {selected.actief ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">Actief</span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500">Inactief</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Keyword</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-blue-700">{selected.keyword}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Facebook Post ID</p>
                    <p className="mt-1 font-mono text-sm text-gray-700 break-all">{selected.postId}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">DM-tekst</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{selected.dmTekst}</p>
                  </div>

                  {selected.project && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gekoppeld project</p>
                      <div className="mt-1 flex items-center gap-2">
                        <FolderIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {selected.project.name}
                          {selected.project.woningAdres && ` — ${selected.project.woningAdres}`}
                          {selected.project.woningPlaats && `, ${selected.project.woningPlaats}`}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aangemaakt</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {new Date(selected.createdAt).toLocaleDateString("nl-NL", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Panel actions */}
            {!editing && (
              <div className="border-t border-gray-200 p-4 flex gap-3">
                <button
                  onClick={() => handleToggleActief(selected)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    selected.actief
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                >
                  {selected.actief ? (
                    <><NoSymbolIcon className="h-4 w-4" />Deactiveren</>
                  ) : (
                    <><CheckCircleIcon className="h-4 w-4" />Activeren</>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nieuw aanmaken modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Nieuwe Facebook trigger</h2>
              <button onClick={() => setShowNew(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Facebook Post ID <span className="text-red-500">*</span>
                </label>
                <input
                  placeholder="bijv. 123456789012345_987654321098765"
                  value={newForm.postId}
                  onChange={e => setNewForm(f => ({ ...f, postId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Keyword <span className="text-red-500">*</span>
                </label>
                <input
                  placeholder="bijv. spijkenisse"
                  value={newForm.keyword}
                  onChange={e => setNewForm(f => ({ ...f, keyword: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-xs text-gray-500">Wordt automatisch omgezet naar kleine letters.</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  DM-tekst (incl. link) <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="Hoi! Bedankt voor je reactie. Hier vind je alle info: https://..."
                  value={newForm.dmTekst}
                  onChange={e => setNewForm(f => ({ ...f, dmTekst: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Gekoppeld project (optioneel)</label>
                <select
                  value={newForm.projectId}
                  onChange={e => setNewForm(f => ({ ...f, projectId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Geen project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.woningPlaats ? ` · ${p.woningPlaats}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-200 px-6 py-4">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? "Aanmaken..." : "Trigger aanmaken"}
              </button>
              <button
                onClick={() => { setShowNew(false); setError(null); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
