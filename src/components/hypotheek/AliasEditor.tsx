"use client";
import { useEffect, useState } from "react";
export default function AliasEditor({ adviseurId }: {
    adviseurId: string;
}) {
    const [text, setText] = useState(""), [message, setMessage] = useState("");
    useEffect(() => { fetch(`/api/hypotheekadviseurs/${adviseurId}/emailadressen`).then(r => r.json()).then(d => setText((d.adressen || []).map((a: {
        email: string;
    }) => a.email).join("\n"))).catch(() => setMessage("Adressen konden niet worden geladen.")); }, [adviseurId]);
    async function save() { const r = await fetch(`/api/hypotheekadviseurs/${adviseurId}/emailadressen`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adressen: text }) }); const d = await r.json(); setMessage(r.ok ? "Adressen opgeslagen" : d.error || "Opslaan mislukt"); }
    return <details><summary className="cursor-pointer text-sm font-medium">E-mailadressen voor doorverwijzingen</summary><p className="my-2 text-xs text-gray-500">Extra adressen van deze partner, één per regel. Het algemene partneradres wordt ook herkend.</p><textarea aria-label="Extra adviseursadressen" className="w-full rounded border p-2 text-sm" rows={3} value={text} onChange={e => setText(e.target.value)}/><button className="text-sm text-blue-700" onClick={() => save().catch(() => setMessage("Opslaan mislukt"))}>Adressen opslaan</button><p role="status" className="text-sm">{message}</p></details>;
}
