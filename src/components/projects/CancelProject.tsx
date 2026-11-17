"use client";

import { useState, type FormEvent } from "react";

export default function CancelProject({ id, updatedAt, onCancelled }: {
  id: string; updatedAt: string; onCancelled: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projecten/${id}/annuleren`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), updatedAt }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Annuleren is niet gelukt.");
      await onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Annuleren is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-medium text-red-700 hover:underline">Project annuleren</button>;

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="font-semibold">Project annuleren</h2>
      <p className="text-sm">Dit project verdwijnt uit de actieve pipeline. Open voorstellen worden ingetrokken. Het dossier blijft bewaard.</p>
      <p className="text-xs text-gray-600">Er wordt geen bericht verstuurd. Bestaande ondertekenverzoeken, afspraken en taken blijven ongewijzigd.</p>
      <label className="block text-sm font-medium">Reden (intern)
        <input autoFocus required list="project-cancel-reasons" maxLength={191} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Kies een reden of vul er zelf een in" className="mt-1 block w-full max-w-md rounded border border-gray-300 bg-white p-2" />
      </label>
      <datalist id="project-cancel-reasons">
        <option value="Gekozen voor een andere makelaar" /><option value="Opdracht gaat niet door" />
      </datalist>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy || !reason.trim()} className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Bezig…" : "Annulering bevestigen"}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(""); }} className="text-sm">Terug</button>
      </div>
    </form>
  );
}
