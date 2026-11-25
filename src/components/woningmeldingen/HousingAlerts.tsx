"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  alertLabels,
  previewAlert,
  templates,
  type AlertKind,
} from "@/lib/housingAlerts";

type Contact = {
  id: number;
  firstname: string | null;
  lastname: string | null;
  mobile: string | null;
  phone: string | null;
};
type Rule = {
  id: string;
  address: string;
  city: string;
  kind: AlertKind;
  mode: string;
  state: string;
  recipientName: string;
  note: string | null;
  template: string;
};
type Delivery = {
  id: string;
  body: string;
  state: string;
  draftId: string | null;
  rule: { recipientName: string; kind: AlertKind };
  draft: { status: string; body: string; deliveryError: string | null } | null;
};
type Event = {
  id: string;
  address: string;
  city: string;
  receivedAt: string;
  status: AlertKind | null;
  askingPrice: number | null;
  transactionPrice: number | null;
  review: string | null;
  deliveries: Delivery[];
};
type Data = { rules: Rule[]; events: Event[]; live: boolean; last?: string };
type House = { id: string; address: string; city: string };
const field =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm";
const button =
  "rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50";
const states: Record<string, string> = {
  active: "Actief",
  paused: "Gepauzeerd",
  completed: "Afgerond",
  preview: "Meekijkstand",
  ready: "Concept",
  sending: "Verzending in behandeling",
  uncertain: "Verzending controleren",
  sent: "Verzonden",
  review: "Te controleren",
  handled: "Zelf doorgegeven",
  rejected: "Verwijderd",
};
const time = (s: string) =>
  new Date(s).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    dateStyle: "short",
    timeStyle: "short",
  });
async function api(query: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/woningmeldingen" + query, {
    method,
    headers: { "content-type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Ophalen mislukt");
  return result;
}
function RuleForm({ contact, saved }: { contact: Contact; saved: () => void }) {
  const [address, setAddress] = useState(""),
    [city, setCity] = useState(""),
    [chosen, setChosen] = useState(""),
    [houses, setHouses] = useState<House[]>([]);
  const [kind, setKind] = useState<AlertKind>("sold"),
    [mode, setMode] = useState("draft"),
    [template, setTemplate] = useState(templates.sold),
    [note, setNote] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (address.trim().length < 2 || chosen) {
        setHouses([]);
        return;
      }
      api("?q=" + encodeURIComponent(address))
        .then((rows) => {
          if (active) setHouses(rows);
        })
        .catch(() => {
          if (active) setError("Zoeken naar woningen is mislukt");
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [address, chosen]);
  let example = "";
  try {
    example = previewAlert(
      template,
      contact.firstname || "",
      address || "Voorbeeldstraat 10",
      city || "Spijkenisse",
    );
  } catch (e) {
    example = String(e);
  }
  return (
    <form
      className="space-y-3 rounded-lg border bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("", "POST", {
            contactId: contact.id,
            marketObjectId: chosen || null,
            address,
            city,
            kind,
            mode,
            template,
            note,
          });
          saved();
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block">
        Straat en huisnummer met toevoeging
        <input
          required
          className={field}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setChosen("");
          }}
        />
      </label>
      {houses.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border">
          {houses.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full p-2 text-left hover:bg-gray-100"
                onClick={() => {
                  setAddress(h.address);
                  setCity(h.city);
                  setChosen(h.id);
                }}
              >
                {h.address}, {h.city}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="block">
        Plaats
        <input
          required
          className={field}
          value={city}
          readOnly={!!chosen}
          onChange={(e) => setCity(e.target.value)}
        />
      </label>
      <label className="block">
        Wanneer
        <select
          className={field}
          value={kind}
          onChange={(e) => {
            const k = e.target.value as AlertKind;
            setKind(k);
            setTemplate(templates[k]);
          }}
        >
          {Object.entries(alertLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Actie
        <select
          className={field}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="draft">WhatsApp-concept klaarzetten</option>
          <option value="auto">Automatisch versturen</option>
        </select>
      </label>
      <label className="block">
        Bericht
        <textarea
          required
          className={field}
          rows={3}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        />
      </label>
      <div className="rounded bg-gray-50 p-3">
        <strong>Voorbeeld met fictieve bedragen</strong>
        <p>{example}</p>
        <p className="mt-1">
          WhatsApp · {contact.mobile || contact.phone || "nummer ontbreekt"}
        </p>
      </div>
      <label className="block">
        Interne notitie
        <input
          className={field}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p>Zet het volgen van deze woning ook aan in Realworks.</p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button className={button} disabled={busy}>
        Regel opslaan
      </button>
    </form>
  );
}
export default function HousingAlerts({ contact }: { contact?: Contact }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [form, setForm] = useState(false),
    [version, setVersion] = useState(0),
    [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api("?page=" + page + (contact ? "&contactId=" + contact.id : ""))
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [contact, page, version]);
  async function act(id: string, action: string) {
    setBusy(true);
    try {
      await api("", "PATCH", { id, action });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-lg border bg-white p-4 text-sm text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Woningmeldingen</h2>
        {contact && (
          <button className={button} onClick={() => setForm(!form)}>
            {form ? "Sluiten" : "Woningmelding toevoegen"}
          </button>
        )}
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {data && !data.live && (
        <p className="rounded bg-amber-50 p-2">
          Meekijkstand · nieuwe klantmeldingen verschijnen als voorbeeld.
        </p>
      )}
      {form && contact && (
        <RuleForm
          contact={contact}
          saved={() => {
            setForm(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {!data && !error && <p>Woningmeldingen laden…</p>}
      {data && (
        <>
          {!contact && (
            <p>
              Voeg een afspraak toe vanuit de{" "}
              <Link className="underline" href="/contacten">
                contactkaart
              </Link>
              . Laatste ontvangen melding:{" "}
              {data.last ? time(data.last) : "nog geen"}.
            </p>
          )}
          {!data.rules.length && <p>Geen regels op deze pagina.</p>}
          {data.rules.map((r) => (
            <div key={r.id} className="rounded border p-3">
              <strong>
                {r.address}, {r.city}
              </strong>
              <p>
                {r.recipientName} · {alertLabels[r.kind]} ·{" "}
                {r.mode === "auto" ? "Automatisch versturen" : "Concept"} ·{" "}
                {states[r.state]}
              </p>
              {r.note && <p>{r.note}</p>}
              <details>
                <summary className="cursor-pointer">Berichttekst</summary>
                <p>{r.template}</p>
              </details>
              {r.state !== "completed" && (
                <button
                  disabled={busy}
                  className={button}
                  onClick={() =>
                    act(r.id, r.state === "active" ? "pause" : "resume")
                  }
                >
                  {r.state === "active" ? "Pauzeren" : "Hervatten"}
                </button>
              )}
            </div>
          ))}
          {!contact && (
            <>
              <h3 className="font-semibold">Ontvangen meldingen</h3>
              {!data.events.length && <p>Geen meldingen op deze pagina.</p>}
              {data.events.map((e) => (
                <article key={e.id} className="space-y-2 border-t py-3">
                  <strong>
                    {e.address || "Adres onbekend"} {e.city}
                  </strong>{" "}
                  · {time(e.receivedAt)}
                  <p>
                    {e.status ? alertLabels[e.status] : "Prijsmelding"}
                    {e.transactionPrice
                      ? " · Transactieprijs € " +
                        e.transactionPrice.toLocaleString("nl-NL")
                      : ""}
                    {e.askingPrice
                      ? " · Vraagprijs € " +
                        e.askingPrice.toLocaleString("nl-NL")
                      : ""}
                  </p>
                  {e.review && (
                    <p className="text-amber-800">
                      Te controleren · {e.review}
                    </p>
                  )}
                  {!e.review && !e.deliveries.length && (
                    <p>Geen toepasselijke afspraak.</p>
                  )}
                  {e.deliveries.map((d) => (
                    <div
                      key={d.id}
                      className="space-y-1 rounded bg-gray-50 p-3"
                    >
                      <strong>{d.rule.recipientName}</strong> ·{" "}
                      {
                        states[
                          d.draft?.status === "rejected" && d.state === "ready"
                            ? "rejected"
                            : d.state
                        ]
                      }
                      <p className="whitespace-pre-line">
                        {d.draft?.body || d.body}
                      </p>
                      {d.draftId &&
                        d.state === "ready" &&
                        d.draft?.status !== "rejected" && (
                          <Link
                            className="mr-3 underline"
                            href={
                              "/digitale-medewerker?tab=concepten&draft=" +
                              d.draftId +
                              "#concept-" +
                              d.draftId
                            }
                          >
                            Concept openen
                          </Link>
                        )}
                      {["sending", "uncertain"].includes(d.state) && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => act(d.id, "reconcile")}
                        >
                          Verzendstatus controleren
                        </button>
                      )}
                      {["ready", "preview", "review", "uncertain"].includes(
                        d.state,
                      ) && (
                        <button
                          disabled={busy}
                          className={button}
                          onClick={() => act(d.id, "handled")}
                        >
                          Al zelf doorgegeven
                        </button>
                      )}
                    </div>
                  ))}
                </article>
              ))}
            </>
          )}
          <div className="flex gap-2">
            {page > 0 && (
              <button className={button} onClick={() => setPage(page - 1)}>
                Vorige pagina
              </button>
            )}
            {(data.rules.length === 50 || data.events.length === 50) && (
              <button className={button} onClick={() => setPage(page + 1)}>
                Volgende pagina
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
