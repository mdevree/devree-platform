"use client";

import { useState } from "react";

export default function AppointmentActions({
  token,
  preview,
  initialStatus,
}: {
  token: string;
  preview: boolean;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [message, setMessage] = useState("");

  async function submit(action: "confirm" | "cancel") {
    if (preview) {
      setMessage("Preview: er wordt niets opgeslagen.");
      return;
    }

    setBusy(action);
    setMessage("");
    try {
      const res = await fetch(`/api/public/afspraak/${encodeURIComponent(token)}/${action === "confirm" ? "confirm" : "cancel"}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Actie kon niet worden verwerkt.");
        return;
      }
      setStatus(data.status || (action === "confirm" ? "confirmed" : "cancel_requested"));
      setMessage(action === "confirm"
        ? "Dank u wel. Wij hebben uw bevestiging ontvangen."
        : "Dank u wel. Wij hebben uw annulering ontvangen en nemen dit mee in onze planning.");
    } catch {
      setMessage("Actie kon niet worden verwerkt.");
    } finally {
      setBusy(null);
    }
  }

  const confirmed = status === "confirmed";
  const cancelled = status === "cancel_requested" || status === "cancelled";

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => submit("confirm")}
        disabled={busy !== null || confirmed || cancelled}
        className="rounded-md bg-[#0f6b4f] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b543e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "confirm" ? "Bevestigen..." : confirmed ? "Bevestigd" : "Ik ben erbij"}
      </button>
      <button
        type="button"
        onClick={() => submit("cancel")}
        disabled={busy !== null || confirmed || cancelled}
        className="rounded-md border border-[#d8ddd8] bg-white px-5 py-3 text-sm font-semibold text-[#27352f] transition hover:bg-[#f5f7f5] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy === "cancel" ? "Annuleren..." : cancelled ? "Annulering ontvangen" : "Afspraak annuleren"}
      </button>
      {message && <p className="text-sm text-[#58635d] sm:self-center">{message}</p>}
    </div>
  );
}
