"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import {
  adopt,
  changedGroups,
  effectivePpi,
  groups,
  imageStyle,
  price,
  sheets,
  slot,
  validateSheet,
  type Draft,
  type Group,
  type Photo,
  type Sheet,
  type Slot,
  type Source,
} from "@/lib/etalage/model";

type Data = {
  source: Source;
  photos: Photo[];
  suggestion: string;
  draft: Draft;
  revision: number;
  relinked: boolean;
};
const button =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50";
const primary =
  "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const panel = "space-y-4 rounded-xl border border-gray-200 bg-white p-5";
const label = (i: number) => (i === 0 ? "Hoofdfoto" : "Fotovak " + i);
async function checked(response: Response) {
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        "De verbinding met het platform is onderbroken.",
    );
  return response;
}
function sourceValue(s: Source, group: Group) {
  if (group === "prijs")
    return (
      "Website " +
      price(s.websitePrice) +
      " · Project " +
      price(s.projectPrice) +
      " " +
      s.condition
    );
  if (group === "foto’s") return "";
  return (
    groups[group]
      .map((k) => s[k])
      .filter(Boolean)
      .join(" ") || "onbekend"
  );
}
export default function Etalage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const url = "/api/projecten/" + encodeURIComponent(id) + "/etalage";
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState(0);
  const [sheet, setSheet] = useState<Sheet>("set");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; key: string } | null>(
    null,
  );
  const [previewState, setPreviewState] = useState("");
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const dragged = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(checked)
      .then((r) => r.json())
      .then((d: Data) => {
        setData(d);
        setDraft(d.draft);
        setSaved(d.revision && !d.relinked ? d.draft : null);
        setRevision(d.revision);
        if (validateSheet(d.draft, d.photos, "set")) setSheet("voorblad");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    return () => controller.abort();
  }, [url]);

  const key = JSON.stringify({ draft, sheet });
  const issue = draft && data ? validateSheet(draft, data.photos, sheet) : "";
  useEffect(() => {
    if (!draft || !data || issue) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewState("PDF wordt opgebouwd…");
      try {
        const r = await checked(
          await fetch(url + "/pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: key,
            signal: controller.signal,
          }),
        );
        const blob = await r.blob();
        if (controller.signal.aborted) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, key });
        setPreviewState("");
      } catch (e) {
        if (!controller.signal.aborted)
          setPreviewState(
            e instanceof Error ? e.message : "PDF kon niet worden opgebouwd.",
          );
      }
    }, 750);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, url, draft, data, issue, retry]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const dirty = !!draft && draft !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const r = await checked(
        await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft, revision }),
        }),
      );
      setRevision((await r.json()).revision);
      setSaved(draft);
      setMessage("Concept opgeslagen.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }
  const back = (
    <Link
      className="text-sm text-primary underline"
      href={`/projecten/${id}?tab=woning`}
      onClick={(e) => {
        if (
          dirty &&
          !window.confirm(
            "Het concept is nog niet opgeslagen. Toch terug naar de woning?",
          )
        )
          e.preventDefault();
      }}
    >
      Terug naar woning
    </Link>
  );
  if (!data || !draft)
    return (
      <main className={panel}>
        {back}
        <p role="status">{message || "Woning en foto’s ophalen…"}</p>
      </main>
    );
  const edit = (next: Draft) => {
    setDraft(next);
    setMessage("");
    setPreviewState("");
  };
  const setSlots = (slots: Slot[]) => edit({ ...draft, slots });
  const crop = draft.slots[active];
  const photo = data.photos.find((p) => p.id === crop.id);
  const setCrop = (update: Partial<Slot>) =>
    setSlots(
      draft.slots.map((s, i) => (i === active ? { ...s, ...update } : s)),
    );
  function swap(a: number, b: number) {
    if (!draft || a === b) return;
    const slots = [...draft.slots];
    [slots[a], slots[b]] = [slots[b], slots[a]];
    setSlots(slots);
    setActive(b);
  }
  const diff = changedGroups(draft.source, data.source);
  const pdf = preview?.key === key && !issue ? preview.url : "";
  return (
    <main className="mx-auto max-w-7xl space-y-5 pb-12">
      {back}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Etalagebladen</h1>
          <p>
            {draft.source.street} · {draft.source.city}
          </p>
        </div>
        <button className={primary} disabled={!dirty || saving} onClick={save}>
          {saving ? "Wordt opgeslagen…" : "Concept opslaan"}
        </button>
      </header>
      {message && (
        <p role="status" className="rounded-md bg-gray-100 p-3">
          {message}
        </p>
      )}
      {data.relinked && revision === data.revision && (
        <p className={panel}>
          De woningkoppeling is veranderd. Dit is een nieuw voorstel voor de
          huidige woning. Opslaan vervangt het eerdere concept.
        </p>
      )}
      {(!data.source.code || !data.photos.length) && (
        <p className={panel}>
          Er zijn geen websitefoto’s gevonden. Controleer de
          Realworks-objectcode en de fotogalerij van de gepubliceerde woning.
        </p>
      )}
      {!!diff.length && (
        <section className={panel}>
          <h2 className="font-semibold">
            Gewijzigd sinds het opgeslagen ontwerp
          </h2>
          {diff.map((g) => (
            <div key={g} className="border-t pt-3">
              <strong className="capitalize">{g}</strong>
              {g === "foto’s" ? (
                <p>
                  De websitegalerij is gewijzigd. Controleer de geselecteerde
                  vakken hieronder.
                </p>
              ) : (
                <details>
                  <summary>Vergelijk brongegevens</summary>
                  <p>Vorige bron: {sourceValue(draft.source, g)}</p>
                  <p>Actuele bron: {sourceValue(data.source, g)}</p>
                </details>
              )}
              <button
                className={button}
                onClick={() =>
                  edit(adopt(draft, data.source, g, data.suggestion))
                }
              >
                {g === "foto’s"
                  ? "Galerij gecontroleerd"
                  : g === "tekst"
                    ? "Gebruik nieuw tekstvoorstel"
                    : "Actuele gegevens overnemen"}
              </button>
              {g === "tekst" && (
                <button
                  className={button}
                  onClick={() =>
                    edit({
                      ...draft,
                      source: {
                        ...draft.source,
                        description: data.source.description,
                      },
                    })
                  }
                >
                  Eigen tekst behouden
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <section className={panel}>
            <h2 className="font-semibold">Voorblad</h2>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">
                {draft.source.priceLabel} {draft.source.condition}
              </legend>
              {(["website", "project"] as const).map((k) => {
                const v =
                  k === "website"
                    ? draft.source.websitePrice
                    : draft.source.projectPrice;
                return (
                  <label
                    key={k}
                    className="mr-5 inline-flex items-center gap-2"
                  >
                    <input
                      type="radio"
                      name="prijs"
                      checked={draft.priceSource === k}
                      disabled={v === null}
                      onChange={() => edit({ ...draft, priceSource: k })}
                    />
                    {k === "website" ? "Website" : "Project"} {price(v)}
                  </label>
                );
              })}
            </fieldset>
            <p className="text-sm">
              Oplevering: {draft.source.delivery || "onbekend"} · Status:{" "}
              {draft.source.status || "onbekend"}
            </p>
            <label className="block text-sm font-medium">
              Verkooptekst
              <textarea
                className="mt-1 w-full rounded-lg border p-3 font-normal"
                rows={8}
                maxLength={16000}
                value={draft.text}
                onChange={(e) => edit({ ...draft, text: e.target.value })}
              />
            </label>
            {data.source.description && (
              <details>
                <summary className="cursor-pointer text-sm">
                  Volledige aanbiedingstekst
                </summary>
                <p className="mt-2 text-sm">{data.source.description}</p>
              </details>
            )}
          </section>
          <section className={panel}>
            <h2 className="font-semibold">Fotoselectie</h2>
            <p className="text-sm">
              Kies een vak en klik op een foto in de galerij. Sleep twee vakken
              over elkaar om te wisselen.
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {draft.slots.map((s, i) => {
                const p = data.photos.find((p) => p.id === s.id);
                return (
                  <button
                    key={i}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", String(i));
                      event.dataTransfer.effectAllowed = "move";
                      dragged.current = i;
                    }}
                    onDragEnd={() => {
                      dragged.current = null;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragged.current !== null) swap(dragged.current, i);
                      dragged.current = null;
                    }}
                    aria-pressed={active === i}
                    onClick={() => setActive(i)}
                    className={`overflow-hidden rounded border text-xs ${i === active ? "ring-2 ring-primary" : ""}`}
                  >
                    <span
                      className="relative block aspect-[4/3] bg-gray-100"
                      style={{
                        aspectRatio: i ? "4/3" : "481/321",
                        overflow: "hidden",
                      }}
                    >
                      {p && (
                        <Image
                          unoptimized
                          width={p.width}
                          height={p.height}
                          draggable={false}
                          src={p.url}
                          alt=""
                          className="absolute max-w-none"
                          style={imageStyle(p, s, i === 0)}
                        />
                      )}
                    </span>
                    {label(i)}
                    {!p && " · leeg"}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <strong>{label(active)}</strong>
              <button
                className={button}
                disabled={active === 0}
                onClick={() => swap(active, active - 1)}
              >
                ← Vorig vak
              </button>
              <button
                className={button}
                disabled={active === 12}
                onClick={() => swap(active, active + 1)}
              >
                Volgend vak →
              </button>
            </div>
            {photo && (
              <div className="space-y-2">
                {(["zoom", "x", "y"] as const).map((k, i) => (
                  <label key={k} className="flex items-center gap-3 text-sm">
                    <span className="w-24">
                      {["Vergroting", "Horizontaal", "Verticaal"][i]}
                    </span>
                    <input
                      className="flex-1"
                      type="range"
                      min={k === "zoom" ? 1 : 0}
                      max={k === "zoom" ? 3 : 100}
                      step={k === "zoom" ? 0.05 : 1}
                      value={crop[k]}
                      onChange={(e) => setCrop({ [k]: Number(e.target.value) })}
                    />
                  </label>
                ))}
                {effectivePpi(photo, crop, active === 0) < 150 && (
                  <p className="text-sm text-amber-800">
                    Deze uitsnede levert circa{" "}
                    {effectivePpi(photo, crop, active === 0)} pixels per inch.
                    De foto kan op papier minder scherp zijn.
                  </p>
                )}
              </div>
            )}
            <details open>
              <summary className="cursor-pointer font-medium">
                Websitegalerij ({data.photos.length})
              </summary>
              <div className="mt-3 grid max-h-72 grid-cols-5 gap-2 overflow-auto">
                {data.photos.map((p) => (
                  <button
                    key={p.id}
                    title={p.label}
                    aria-label={p.label + " plaatsen in " + label(active)}
                    onClick={() => setCrop(slot(p.id))}
                  >
                    <Image
                      unoptimized
                      width={150}
                      height={150}
                      loading="lazy"
                      className="aspect-square w-full rounded object-cover"
                      src={p.thumb}
                      alt={p.label}
                    />
                  </button>
                ))}
              </div>
            </details>
          </section>
        </div>
        <section className={panel}>
          <h2 className="font-semibold">Afdrukvoorbeeld</h2>
          <label className="flex items-center gap-3 text-sm">
            Blad
            <select
              className={button}
              value={sheet}
              onChange={(e) => {
                setSheet(e.target.value as Sheet);
                setPreviewState("");
              }}
            >
              {Object.entries(sheets).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {pdf ? (
            <>
              <div className="flex gap-2">
                <a
                  className={button}
                  download={`Etalage-${draft.source.street}-${sheet}.pdf`}
                  href={pdf}
                >
                  Download PDF
                </a>
                <button
                  className={button}
                  onClick={() => {
                    try {
                      frame.current?.contentWindow?.focus();
                      frame.current?.contentWindow?.print();
                    } catch {
                      window.open(pdf, "_blank", "noopener");
                    }
                  }}
                >
                  Printen
                </button>
              </div>
              <iframe
                ref={frame}
                title="Afdrukvoorbeeld PDF"
                src={pdf}
                className="h-[75vh] w-full border"
              />
            </>
          ) : (
            <div role="status" className="space-y-3 bg-gray-50 p-4">
              {issue || previewState || "Voorbeeld voorbereiden…"}
              {!issue &&
                previewState &&
                !previewState.includes("opgebouwd…") && (
                  <div>
                    <button
                      className={button}
                      onClick={() => setRetry((n) => n + 1)}
                    >
                      Opnieuw proberen
                    </button>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
