"use client";

import { useState } from "react";

type ExtraOpdrachtgever = {
  aanhef: string;
  initialen: string;
  voornamen: string;
  achternaam: string;
  email: string;
  telefoon: string;
  geboortedatum: string;
  geboorteplaats: string;
  burgerlijkeStaat: string;
};

type BekendeOpdrachtgever = ExtraOpdrachtgever & {
  mauticContactId: number | null;
  naam: string;
  adres: string;
};

const emptyExtraOpdrachtgever: ExtraOpdrachtgever = {
  aanhef: "",
  initialen: "",
  voornamen: "",
  achternaam: "",
  email: "",
  telefoon: "",
  geboortedatum: "",
  geboorteplaats: "",
  burgerlijkeStaat: "",
};

function formatDateNl(value: string) {
  if (!value) return "";
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  const nlMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (nlMatch) return `${nlMatch[1].padStart(2, "0")}-${nlMatch[2].padStart(2, "0")}-${nlMatch[3]}`;
  return value;
}

export default function AankoopChoiceForm({
  token,
  defaultRemarks,
  opdrachtgevers,
}: {
  token: string;
  defaultRemarks: string;
  opdrachtgevers: BekendeOpdrachtgever[];
}) {
  const [remarks, setRemarks] = useState(defaultRemarks || "");
  const [bekendeOpdrachtgevers, setBekendeOpdrachtgevers] = useState<BekendeOpdrachtgever[]>(opdrachtgevers);
  const [editingOpdrachtgevers, setEditingOpdrachtgevers] = useState<Record<number, boolean>>({});
  const [extraOpdrachtgevers, setExtraOpdrachtgevers] = useState<ExtraOpdrachtgever[]>([]);
  const [loading, setLoading] = useState(false);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function payload() {
    return {
      remarks,
      opdrachtgeverCorrecties: bekendeOpdrachtgevers.filter((item) => item.mauticContactId),
      extraOpdrachtgevers: extraOpdrachtgevers.filter((item) => item.achternaam.trim() || item.email.trim()),
    };
  }

  function updateBekendeOpdrachtgever(index: number, patch: Partial<BekendeOpdrachtgever>) {
    setBekendeOpdrachtgevers((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function updateExtraOpdrachtgever(index: number, patch: Partial<ExtraOpdrachtgever>) {
    setExtraOpdrachtgevers((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  async function submit() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/public/otd/proposal/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Akkoord kon niet worden verwerkt");
        return;
      }
      setAccepted(true);
      setMessage("Dank voor uw akkoord. De opdracht tot dienstverlening wordt nu opgemaakt.");
    } catch {
      setError("Akkoord kon niet worden verwerkt");
    } finally {
      setLoading(false);
    }
  }

  async function sendRemarks() {
    setRemarksLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/public/otd/proposal/${encodeURIComponent(token)}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Opmerking kon niet worden verstuurd");
        return;
      }
      setMessage("Uw opmerking is verstuurd. Wij nemen contact met u op.");
    } catch {
      setError("Opmerking kon niet worden verstuurd");
    } finally {
      setRemarksLoading(false);
    }
  }

  if (accepted) {
    return (
      <section className="rounded-lg border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Akkoord ontvangen</p>
        <h2 className="mt-2 text-xl font-semibold text-emerald-950">Wij maken de opdracht tot dienstverlening voor u klaar.</h2>
        <p className="mt-3 text-sm leading-6 text-emerald-900">
          De opdracht wordt gecontroleerd en daarna eerst door de makelaar ondertekend. Daarna ontvangt u per e-mail een uitnodiging om de opdracht digitaal te ondertekenen.
        </p>
        <p className="mt-2 text-sm leading-6 text-emerald-900">
          Na ondertekening nemen wij contact met u op om uw woonwensen en de eerste stappen door te nemen.
        </p>
      </section>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Gegevens voor de opdracht</p>
        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">
          Wij vullen de opdracht tot dienstverlening alvast voor met de aangeleverde gegevens. Controleer de gegevens hieronder en pas ze aan waar nodig.
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {bekendeOpdrachtgevers.map((opdrachtgever, index) => {
          const isEditing = Boolean(editingOpdrachtgevers[index]);
          return (
            <div key={`${opdrachtgever.mauticContactId || opdrachtgever.email || opdrachtgever.naam}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-950">{opdrachtgever.naam}</p>
                  {!opdrachtgever.mauticContactId && (
                    <p className="mt-1 text-xs leading-5 text-amber-700">Deze gegevens zijn nog niet aan een contact gekoppeld.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOpdrachtgevers((items) => ({ ...items, [index]: !isEditing }))}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-100"
                >
                  {isEditing ? "Sluiten" : "Gegevens aanpassen"}
                </button>
              </div>

              {!isEditing ? (
                <dl className="mt-3 grid gap-2 text-sm">
                  {[
                    ["Aanhef", opdrachtgever.aanhef],
                    ["Initialen", opdrachtgever.initialen],
                    ["Voornamen", opdrachtgever.voornamen],
                    ["Geboortedatum", formatDateNl(opdrachtgever.geboortedatum)],
                    ["E-mail", opdrachtgever.email],
                    ["Telefoon", opdrachtgever.telefoon],
                    ["Adres", opdrachtgever.adres],
                    ["Geboorteplaats", opdrachtgever.geboorteplaats],
                    ["Burgerlijke staat", opdrachtgever.burgerlijkeStaat],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[120px_1fr] gap-3">
                      <dt className="text-gray-500">{label}</dt>
                      <dd className={value ? "text-gray-900" : "text-amber-700"}>
                        {value || "Nog niet bekend"}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Aanhef</span>
                    <input value={opdrachtgever.aanhef} onChange={(event) => updateBekendeOpdrachtgever(index, { aanhef: event.target.value })} placeholder="Bijv. mevrouw" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Initialen</span>
                    <input value={opdrachtgever.initialen} onChange={(event) => updateBekendeOpdrachtgever(index, { initialen: event.target.value })} placeholder="Bijv. A.B." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Voornamen</span>
                    <input value={opdrachtgever.voornamen} onChange={(event) => updateBekendeOpdrachtgever(index, { voornamen: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Naam</span>
                    <input value={opdrachtgever.naam} onChange={(event) => updateBekendeOpdrachtgever(index, { naam: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">E-mailadres</span>
                    <input type="email" value={opdrachtgever.email} onChange={(event) => updateBekendeOpdrachtgever(index, { email: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Telefoon</span>
                    <input value={opdrachtgever.telefoon} onChange={(event) => updateBekendeOpdrachtgever(index, { telefoon: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Geboortedatum</span>
                    <input type="date" value={opdrachtgever.geboortedatum} onChange={(event) => updateBekendeOpdrachtgever(index, { geboortedatum: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Geboorteplaats</span>
                    <input value={opdrachtgever.geboorteplaats} onChange={(event) => updateBekendeOpdrachtgever(index, { geboorteplaats: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-gray-600">Burgerlijke staat</span>
                    <input value={opdrachtgever.burgerlijkeStaat} onChange={(event) => updateBekendeOpdrachtgever(index, { burgerlijkeStaat: event.target.value })} placeholder="Bijv. gehuwd, ongehuwd" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setExtraOpdrachtgevers((items) => [...items, { ...emptyExtraOpdrachtgever }])}
          className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-sm font-semibold text-gray-800 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900"
        >
          Opdrachtgever toevoegen
        </button>
      </div>

      {extraOpdrachtgevers.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="mt-4 space-y-4">
            {extraOpdrachtgevers.map((extra, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">Extra opdrachtgever {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => setExtraOpdrachtgevers((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                    className="text-sm font-medium text-red-700 hover:text-red-800"
                  >
                    Verwijderen
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Aanhef</span>
                    <input value={extra.aanhef} onChange={(event) => updateExtraOpdrachtgever(index, { aanhef: event.target.value })} placeholder="Bijv. mevrouw" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Initialen</span>
                    <input value={extra.initialen} onChange={(event) => updateExtraOpdrachtgever(index, { initialen: event.target.value })} placeholder="Bijv. A.B." className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Voornamen</span>
                    <input value={extra.voornamen} onChange={(event) => updateExtraOpdrachtgever(index, { voornamen: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Achternaam</span>
                    <input value={extra.achternaam} onChange={(event) => updateExtraOpdrachtgever(index, { achternaam: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">E-mailadres</span>
                    <input type="email" value={extra.email} onChange={(event) => updateExtraOpdrachtgever(index, { email: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Telefoon</span>
                    <input value={extra.telefoon} onChange={(event) => updateExtraOpdrachtgever(index, { telefoon: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Geboortedatum</span>
                    <input type="date" value={extra.geboortedatum} onChange={(event) => updateExtraOpdrachtgever(index, { geboortedatum: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Geboorteplaats</span>
                    <input value={extra.geboorteplaats} onChange={(event) => updateExtraOpdrachtgever(index, { geboorteplaats: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Burgerlijke staat</span>
                    <input value={extra.burgerlijkeStaat} onChange={(event) => updateExtraOpdrachtgever(index, { burgerlijkeStaat: event.target.value })} placeholder="Bijv. gehuwd, ongehuwd" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700" />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Op- of aanmerkingen</span>
          <span className="mt-1 block text-sm leading-6 text-gray-600">
            Heeft u vragen of andere wensen, bijvoorbeeld over het werkgebied of de tarieven? Laat het ons weten, dan nemen wij contact met u op om dit te bespreken.
          </span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={submit}
          disabled={loading || remarksLoading}
          className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {loading ? "Akkoord verwerken..." : "Akkoord geven"}
        </button>
        <button
          type="button"
          onClick={sendRemarks}
          disabled={loading || remarksLoading}
          className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {remarksLoading ? "Opmerking versturen..." : "Vraag of opmerking versturen"}
        </button>
      </div>
    </div>
  );
}
