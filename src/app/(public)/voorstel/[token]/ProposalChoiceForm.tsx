"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "DIRECT",
    label: "Direct starten",
    description: "Na ondertekening nemen wij zo snel mogelijk contact op om de fotograaf in te plannen.",
  },
  {
    value: "UITGESTELD",
    label: "Toekomstig aanbod",
    description: "Wij mogen alvast voorbereiden, maar brengen de woning later actief onder de aandacht.",
  },
];

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

export default function ProposalChoiceForm({
  token,
  defaultVerkoopstart,
  defaultStartdatum,
  defaultStartReden,
  defaultSilentSale,
  defaultRemarks,
  defaultEnergielabelChoice,
  defaultEnergielabelNote,
  defaultQuickscanChoice,
  defaultQuickscanNote,
  energielabelKosten,
  quickscanKosten,
}: {
  token: string;
  defaultVerkoopstart: string;
  defaultStartdatum: string;
  defaultStartReden: string;
  defaultSilentSale: boolean;
  defaultRemarks: string;
  defaultEnergielabelChoice: string;
  defaultEnergielabelNote: string;
  defaultQuickscanChoice: string;
  defaultQuickscanNote: string;
  energielabelKosten: number;
  quickscanKosten: number;
}) {
  const initialVerkoopstart = defaultVerkoopstart === "SLAPEND" ? "UITGESTELD" : defaultVerkoopstart || "DIRECT";
  const [verkoopstart, setVerkoopstart] = useState(initialVerkoopstart);
  const [startdatum, setStartdatum] = useState(defaultStartdatum || "");
  const [startReden, setStartReden] = useState(defaultStartReden || "");
  const [silentSale, setSilentSale] = useState(defaultSilentSale || defaultVerkoopstart === "SLAPEND");
  const [remarks, setRemarks] = useState(defaultRemarks || "");
  const [energielabelChoice, setEnergielabelChoice] = useState(defaultEnergielabelChoice || "AANWEZIG_OF_ZELF");
  const [energielabelNote, setEnergielabelNote] = useState(defaultEnergielabelNote || "");
  const [quickscanChoice, setQuickscanChoice] = useState(defaultQuickscanChoice || "ZELF_REGELEN");
  const [quickscanNote, setQuickscanNote] = useState(defaultQuickscanNote || "");
  const [extraOpdrachtgevers, setExtraOpdrachtgevers] = useState<ExtraOpdrachtgever[]>([]);
  const [loading, setLoading] = useState(false);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function payload() {
    return {
      verkoopstart,
      startdatum,
      startReden,
      silentSale,
      remarks,
      energielabelChoice,
      energielabelNote,
      quickscanChoice,
      quickscanNote,
      extraOpdrachtgevers: extraOpdrachtgevers.filter((item) => item.achternaam.trim() || item.email.trim()),
    };
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
          Na ondertekening maken wij uw digitale klantomgeving aan op Move.nl. Bij direct starten nemen wij zo snel mogelijk contact op om de fotograaf in te plannen.
        </p>
      </section>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Uw keuze</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setVerkoopstart(option.value)}
            className={`min-h-[116px] rounded-lg border p-4 text-left transition ${
              verkoopstart === option.value
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">{option.description}</span>
          </button>
        ))}
      </div>

      {verkoopstart !== "DIRECT" && (
        <div className="mt-4 space-y-3">
          <label className="block max-w-sm">
            <span className="text-xs font-medium text-gray-600">Beoogde startdatum</span>
            <input
              type="date"
              value={startdatum}
              onChange={(event) => setStartdatum(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
          <label className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <input
              type="checkbox"
              checked={silentSale}
              onChange={(event) => setSilentSale(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Stille verkoop</span>
              <span className="mt-1 block text-xs leading-5 text-gray-500">
                Wij zorgen dat het object alvast beperkt zichtbaar is in de uitwisselingssystemen, maar brengen de woning nog niet groots openbaar onder de aandacht.
              </span>
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Toelichting</span>
            <input
              type="text"
              value={startReden}
              onChange={(event) => setStartReden(event.target.value)}
              placeholder="Bijvoorbeeld: starten per genoemde datum of eerst alleen voorbereiden"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Energielabel</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Indien gewenst zetten wij de opdracht voor u uit om een energielabel te laten opmaken. Een energielabel is verplicht voordat we de woning online publiceren. Als u al een energielabel heeft of dit zelf regelt, kunt u dat hieronder aangeven.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEnergielabelChoice("AANWEZIG_OF_ZELF")}
            className={`rounded-lg border p-4 text-left transition ${
              energielabelChoice === "AANWEZIG_OF_ZELF"
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">Al aanwezig of zelf regelen</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">Geen kosten via De Vree Makelaardij.</span>
          </button>
          <button
            type="button"
            onClick={() => setEnergielabelChoice("VIA_MAKELAAR")}
            className={`rounded-lg border p-4 text-left transition ${
              energielabelChoice === "VIA_MAKELAAR"
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">Via De Vree regelen</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">
              Alleen als er nog geen geldig energielabel is. Maximaal € {energielabelKosten.toLocaleString("nl-NL")},- incl. btw.
            </span>
          </button>
        </div>
        {energielabelChoice === "AANWEZIG_OF_ZELF" && (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-gray-600">Eventuele toelichting</span>
            <input
              type="text"
              value={energielabelNote}
              onChange={(event) => setEnergielabelNote(event.target.value)}
              placeholder="Bijvoorbeeld: energielabel is al geldig of opdrachtgever regelt dit zelf"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
        )}
      </div>

      {quickscanKosten > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Quickscan fundering</p>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Voor deze woning adviseren wij om vooraf een quickscan naar de fundering te laten uitvoeren. U kunt dit zelf regelen of door ons laten uitzetten bij een gespecialiseerd bedrijf.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setQuickscanChoice("ZELF_REGELEN")}
              className={`rounded-lg border p-4 text-left transition ${
                quickscanChoice === "ZELF_REGELEN"
                  ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="block text-sm font-semibold">Zelf regelen</span>
              <span className="mt-2 block text-xs leading-5 text-gray-500">Geen kosten via De Vree Makelaardij.</span>
            </button>
            <button
              type="button"
              onClick={() => setQuickscanChoice("VIA_MAKELAAR")}
              className={`rounded-lg border p-4 text-left transition ${
                quickscanChoice === "VIA_MAKELAAR"
                  ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="block text-sm font-semibold">Via De Vree regelen</span>
              <span className="mt-2 block text-xs leading-5 text-gray-500">
                Wij zetten de opdracht voor u uit. Kosten: € {quickscanKosten.toLocaleString("nl-NL")},- incl. btw.
              </span>
            </button>
          </div>
          {quickscanChoice === "ZELF_REGELEN" && (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-gray-600">Eventuele toelichting</span>
              <input
                type="text"
                value={quickscanNote}
                onChange={(event) => setQuickscanNote(event.target.value)}
                placeholder="Bijvoorbeeld: opdrachtgever regelt dit zelf"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
              />
            </label>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Gegevens voor de opdracht</p>
        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-900">
          Wij vullen de opdracht tot dienstverlening alvast voor met de aangeleverde gegevens en gegevens uit het Kadaster. Mist er een opdrachtgever, dan kunt u die hieronder doorgeven.
        </div>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Extra opdrachtgever</p>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              Bijvoorbeeld een partner of mede-eigenaar die ook moet tekenen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExtraOpdrachtgevers((items) => [...items, { ...emptyExtraOpdrachtgever }])}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Opdrachtgever toevoegen
          </button>
        </div>

        {extraOpdrachtgevers.length > 0 && (
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
        )}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-5">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Op- of aanmerkingen</span>
          <span className="mt-1 block text-sm leading-6 text-gray-600">
            Heeft u andere wensen, bijvoorbeeld over vraagprijs of verkoopmethode? Laat het ons weten, dan nemen wij contact met u op om dit te bespreken.
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
