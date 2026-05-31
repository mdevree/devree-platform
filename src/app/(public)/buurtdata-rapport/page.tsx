"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  MagnifyingGlassIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import { BuurtdataReport } from "@/components/buurtdata/BuurtdataReport";
import type { BuurtdataResult } from "@/types/buurtdata";

type Step = "adres" | "gegevens" | "rapport";

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "adres", label: "Adres" },
    { key: "gegevens", label: "Gegevens" },
    { key: "rapport", label: "Rapport" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  done
                    ? "bg-primary text-white"
                    : active
                    ? "border-2 border-primary bg-white text-primary"
                    : "border-2 border-gray-200 bg-white text-gray-400"
                }`}
              >
                {done ? <CheckCircleIcon className="h-5 w-5" /> : i + 1}
              </div>
              <span
                className={`mt-1 text-xs font-medium ${
                  active ? "text-primary" : done ? "text-gray-600" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mb-4 h-0.5 w-12 sm:w-20 ${i < currentIndex ? "bg-primary" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BuurtdataRapportPage() {
  const [step, setStep] = useState<Step>("adres");

  // Adres velden
  const [postcode, setPostcode] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [huisletter, setHuisletter] = useState("");
  const [toevoeging, setToevoeging] = useState("");

  // Contact velden
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [toestemming, setToestemming] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BuurtdataResult | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  // Stuur hoogte naar parent (iframe resize)
  useEffect(() => {
    const sendHeight = () => {
      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "devree-buurtdata-resize", height: document.body.scrollHeight },
          "*"
        );
      }
    };
    sendHeight();
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [step, data]);

  function handleAdresSubmit(e: FormEvent) {
    e.preventDefault();
    const postcodeNorm = postcode.replace(/\s/g, "").toUpperCase();
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcodeNorm)) {
      setError("Voer een geldige postcode in (bijv. 1234AB)");
      return;
    }
    if (!huisnummer || parseInt(huisnummer, 10) < 1) {
      setError("Voer een geldig huisnummer in");
      return;
    }
    setError(null);
    setStep("gegevens");
  }

  async function handleGegevensSubmit(e: FormEvent) {
    e.preventDefault();
    if (!toestemming) {
      setError("Geef toestemming om het rapport te ontvangen");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/public/buurtdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.replace(/\s/g, "").toUpperCase(),
          huisnummer: parseInt(huisnummer, 10),
          huisletter: huisletter.trim() || null,
          huisnummer_toevoeging: toevoeging.trim() || null,
          naam: naam.trim(),
          email: email.trim().toLowerCase(),
          telefoon: telefoon.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Onbekende fout bij ophalen rapport");
        return;
      }

      setData(json);
      setStep("rapport");

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      setError("Kan geen verbinding maken. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  const postcodeDisplay = postcode.replace(/\s/g, "").toUpperCase();
  const adresLabel =
    postcodeDisplay && huisnummer
      ? `${postcodeDisplay} ${huisnummer}${huisletter ? huisletter : ""}${toevoeging ? ` ${toevoeging}` : ""}`
      : "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Image
            src="https://www.devreemakelaardij.nl/wp-content/uploads/2026/01/LOGO-1.png"
            alt="De Vree Makelaardij"
            width={140}
            height={42}
            className="h-9 w-auto object-contain"
            unoptimized
          />
          <span className="hidden text-sm text-gray-500 sm:block">
            Gratis buurtrapport — openbare data, professioneel samengesteld
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* ── Stap indicator ── */}
        {step !== "rapport" && (
          <div className="mb-8 flex justify-center">
            <StepIndicator current={step} />
          </div>
        )}

        {/* ── Stap 1: Adres ── */}
        {step === "adres" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-gray-900">
                Ontdek uw buurt in één oogopslag
              </h1>
              <p className="mt-2 text-gray-500">
                Voer uw adres in en ontvang een gratis uitgebreid buurtrapport met
                leefbaarheid, demografie, woningmarkt, klimaat en meer.
              </p>
            </div>

            <form onSubmit={handleAdresSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Postcode <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="1234AB"
                    required
                    maxLength={7}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm uppercase focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Huisnummer <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={huisnummer}
                    onChange={(e) => setHuisnummer(e.target.value)}
                    placeholder="1"
                    required
                    min="1"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Huisletter</label>
                  <input
                    type="text"
                    value={huisletter}
                    onChange={(e) => setHuisletter(e.target.value)}
                    placeholder="A"
                    maxLength={1}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Toevoeging</label>
                  <input
                    type="text"
                    value={toevoeging}
                    onChange={(e) => setToevoeging(e.target.value)}
                    placeholder="bis"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
                Mijn buurtrapport bekijken
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </form>

            {/* Wat zit er in het rapport */}
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { icon: "🏘️", label: "Leefbaarheid & veiligheid" },
                { icon: "👥", label: "Bevolking & demografie" },
                { icon: "🏠", label: "Woningmarkt & WOZ" },
                { icon: "💰", label: "Inkomen & welvaart" },
                { icon: "🌿", label: "Klimaat & groen" },
                { icon: "🔬", label: "Luchtkwaliteit" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stap 2: Gegevens ── */}
        {step === "gegevens" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            {/* Adres bevestiging */}
            <div className="mb-6 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-primary/70">
                Rapport aanvragen voor
              </p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{adresLabel}</p>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Ontvang uw gratis buurtrapport
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Vul uw gegevens in. Het rapport wordt direct weergegeven en De Vree
                Makelaardij kan u bereiken voor persoonlijk advies over uw woonsituatie.
              </p>
            </div>

            <form onSubmit={handleGegevensSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Uw naam <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={naam}
                  onChange={(e) => setNaam(e.target.value)}
                  placeholder="Jan de Vries"
                  required
                  minLength={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  E-mailadres <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan@voorbeeld.nl"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Telefoonnummer{" "}
                  <span className="text-xs font-normal text-gray-400">(optioneel)</span>
                </label>
                <input
                  type="tel"
                  value={telefoon}
                  onChange={(e) => setTelefoon(e.target.value)}
                  placeholder="06-12345678"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={toestemming}
                  onChange={(e) => setToestemming(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                />
                <span className="text-sm text-gray-600">
                  Ik geef toestemming aan{" "}
                  <strong className="text-gray-800">De Vree Makelaardij</strong> om contact
                  met mij op te nemen over mijn woonsituatie en gerelateerde diensten.{" "}
                  <span className="text-xs text-gray-400">
                    Uw gegevens worden vertrouwelijk behandeld conform de AVG.
                  </span>
                </span>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep("adres"); setError(null); }}
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Terug
                </button>
                <button
                  type="submit"
                  disabled={loading || !toestemming}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Rapport ophalen…
                    </>
                  ) : (
                    <>
                      Ontvang mijn gratis rapport
                      <ArrowRightIcon className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Stap 3: Rapport ── */}
        {step === "rapport" && data && (
          <div ref={reportRef}>
            {/* Succes banner */}
            <div className="mb-6 flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Uw rapport is klaar</p>
                  <p className="text-sm text-green-600">
                    We sturen u een bevestiging op <strong>{email}</strong>. De Vree
                    Makelaardij neemt binnenkort contact met u op.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="hidden shrink-0 items-center gap-2 rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50 sm:flex"
              >
                <PrinterIcon className="h-4 w-4" />
                Afdrukken
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm print:shadow-none print:border-0">
              <BuurtdataReport data={data} showLogo />
            </div>

            {/* CTA onderaan */}
            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
              <p className="font-semibold text-gray-900">
                Wilt u meer weten over kopen, verkopen of uw woningwaarde?
              </p>
              <p className="mt-1 text-sm text-gray-500">
                De Vree Makelaardij helpt u graag verder met persoonlijk advies.
              </p>
              <a
                href="https://www.devreemakelaardij.nl/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Neem contact op
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="mt-12 border-t border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-400 print:hidden">
        <p>
          © {new Date().getFullYear()} De Vree Makelaardij · Data is indicatief en gebaseerd op
          openbare bronnen (CBS, BAG, Kadaster) · Geen rechten te ontlenen aan dit rapport
        </p>
      </footer>
    </div>
  );
}
