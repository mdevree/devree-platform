"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { signOut } from "next-auth/react";
import { DRAFTS_PATH, whatsappDraftLoginPath } from "@/lib/whatsappDraftLinks";

type Preferences = { office: boolean; personal: boolean };
type WebPushOptions = Preferences & { enabled: boolean; publicKey: string | null };
type Device = {
  id: string;
  registration: ServiceWorkerRegistration;
  subscription: PushSubscription | null;
  publicKey: Uint8Array<ArrayBuffer>;
};

const endpoint = "/api/mobile/whatsapp-web-push";
const storageKey = "devree-whatsapp-web-push-device";

class WebPushError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isInstalled() {
  const device = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || device.standalone === true;
}

function browserSupportsPush() {
  return isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function deviceId() {
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(storageKey, id);
  return id;
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function readOptions(id: string, signal: AbortSignal): Promise<WebPushOptions> {
  const response = await fetch(`${endpoint}?deviceId=${encodeURIComponent(id)}`, { cache: "no-store", signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WebPushError(data?.error ?? "Meldingsvoorkeuren konden niet worden geladen.", response.status);
  }
  return data;
}

async function saveOptions(id: string, choices: Preferences, subscription: PushSubscription | null): Promise<Preferences> {
  const registration = subscription?.toJSON();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: id,
      ...choices,
      ...(registration && {
        subscription: { endpoint: registration.endpoint, keys: registration.keys },
      }),
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new WebPushError(data?.error ?? "Meldingsvoorkeuren konden niet worden opgeslagen.", response.status);
  return data;
}

export default function WhatsAppWebPushSettings({ personalAvailable }: { personalAvailable: boolean }) {
  const [mode, setMode] = useState<"loading" | "install" | "unsupported" | "inactive" | "ready">("loading");
  const [device, setDevice] = useState<Device | null>(null);
  const [saved, setSaved] = useState<Preferences>({ office: false, personal: false });
  const [choices, setChoices] = useState<Preferences>({ office: false, personal: false });
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const working = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      if (!isInstalled()) {
        setMode("install");
        return;
      }
      if (!browserSupportsPush()) {
        setMode("unsupported");
        return;
      }
      try {
        const id = deviceId();
        const options = await readOptions(id, controller.signal);
        if (controller.signal.aborted) return;
        if (!options.enabled || !options.publicKey) {
          setMode("inactive");
          return;
        }
        const publicKey = applicationServerKey(options.publicKey);
        const registration = await navigator.serviceWorker.register("/mobile/whatsapp-concepten-sw.js", {
          scope: DRAFTS_PATH,
          updateViaCache: "none",
        });
        const active = registration.active ? registration : await navigator.serviceWorker.ready;
        if (active.scope !== new URL(DRAFTS_PATH, location.origin).href) {
          throw new Error("De WhatsApp-meldingen konden niet worden voorbereid.");
        }
        const subscription = await active.pushManager.getSubscription();
        if (controller.signal.aborted) return;
        setDevice({ id, registration: active, publicKey, subscription });
        const preferences = { office: options.office, personal: options.personal };
        setSaved(preferences);
        setChoices(preferences);
        setMode("ready");
      } catch (failure) {
        if (controller.signal.aborted) return;
        setMode("inactive");
        setRequiresLogin(failure instanceof WebPushError && [401, 409].includes(failure.status));
        setError((failure as Error).message);
      }
    }
    void Promise.resolve().then(prepare);
    return () => controller.abort();
  }, [attempt]);

  async function save() {
    if (!device || working.current) return;
    working.current = true;
    setBusy("save");
    setError("");
    setMessage("");
    setRequiresLogin(false);
    const desired = { office: choices.office, personal: personalAvailable && choices.personal };
    const enabled = desired.office || desired.personal;
    try {
      let subscription = device.subscription;
      if (enabled && !subscription) {
        // Call subscribe from this click, before awaiting any network or worker work.
        subscription = await device.registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: device.publicKey,
        });
        setDevice({ ...device, subscription });
      }
      const updated = await saveOptions(device.id, desired, enabled ? subscription : null);
      setSaved(updated);
      setChoices(updated);
      if (!enabled && subscription && await subscription.unsubscribe().catch(() => false)) {
        setDevice({ ...device, subscription: null });
      }
      setMessage("Meldingsvoorkeuren opgeslagen.");
    } catch (failure) {
      setRequiresLogin(failure instanceof WebPushError && [401, 409].includes(failure.status));
      setError(Notification.permission === "denied"
        ? "Sta meldingen voor De Vree Concepten toe in de iPhone-instellingen en probeer opnieuw."
        : (failure as Error).message);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function testNotification() {
    if (!device?.subscription || working.current) return;
    working.current = true;
    setBusy("test");
    setError("");
    setMessage("");
    setRequiresLogin(false);
    try {
      const response = await fetch(`${endpoint}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 410) {
        await device.subscription.unsubscribe().catch(() => false);
        setDevice({ ...device, subscription: null });
      }
      if (!response.ok) throw new WebPushError(result?.error ?? "De testmelding kon niet worden aangeboden.", response.status);
      setMessage("Testmelding aangeboden. Controleer of de melding op je toestel verschijnt.");
    } catch (failure) {
      setRequiresLogin(failure instanceof WebPushError && [401, 409].includes(failure.status));
      setError((failure as Error).message);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  const hasSaved = saved.office || saved.personal;
  const needsReconnect = hasSaved && !device?.subscription;
  const dirty = needsReconnect || choices.office !== saved.office || choices.personal !== saved.personal;
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 py-3 font-medium">
        <BellIcon className="h-5 w-5 text-primary" aria-hidden="true" />
        WhatsApp-meldingen
        <ChevronDownIcon className="ml-auto size-4 text-gray-600 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-4 py-4 text-sm">
        {mode === "install" && (
          <p>Open deze pagina op je iPhone in Safari. Kies <strong>Deel → Zet op beginscherm</strong>. Laat <strong>Open als webapp</strong> aan als die instelling verschijnt en open daarna De Vree Concepten vanaf je beginscherm.</p>
        )}
        {mode === "unsupported" && <p>Webmeldingen zijn op dit toestel niet beschikbaar. Op iPhone heb je iOS 16.4 of nieuwer nodig.</p>}
        {mode === "loading" && <p role="status">Meldingen voorbereiden…</p>}
        {mode === "inactive" && !error && <p>Webmeldingen zijn nog niet beschikbaar.</p>}
        {mode === "ready" && (
          <>
            <p>De melding toont de afzender en een korte samenvatting. Kies op je iPhone onder Instellingen → Meldingen → De Vree Concepten bij <strong>Toon voorvertoning</strong> voor <strong>Indien ontgrendeld</strong>.</p>
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={choices.office} disabled={Boolean(busy)} className="size-5 accent-primary"
                onChange={(event) => setChoices({ ...choices, office: event.target.checked })} />
              Kantoorconcepten
            </label>
            {personalAvailable && (
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked={choices.personal} disabled={Boolean(busy)} className="size-5 accent-primary"
                  onChange={(event) => setChoices({ ...choices, personal: event.target.checked })} />
                Persoonlijke concepten
              </label>
            )}
            {needsReconnect && <p>Schakel meldingen opnieuw in om dit toestel te verbinden.</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={!dirty || Boolean(busy)}
                className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-50">
                {busy === "save" ? "Opslaan…" : "Voorkeuren opslaan"}
              </button>
              {hasSaved && device?.subscription && (
                <button type="button" onClick={testNotification} disabled={Boolean(busy)}
                  className="min-h-11 rounded-lg border border-gray-300 px-4 py-2.5 font-semibold disabled:opacity-50">
                  {busy === "test" ? "Testmelding voorbereiden…" : "Stuur testmelding"}
                </button>
              )}
            </div>
          </>
        )}
        {message && <p role="status" className="text-gray-700">{message}</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {requiresLogin ? (
          <button type="button" className="min-h-11 font-semibold text-primary underline"
            onClick={() => void signOut({ redirectTo: whatsappDraftLoginPath() })}>
            Opnieuw inloggen
          </button>
        ) : mode === "inactive" && error && (
          <button type="button" className="min-h-11 font-semibold text-primary underline"
            onClick={() => {
              setError("");
              setMode("loading");
              setAttempt((count) => count + 1);
            }}>
            Opnieuw proberen
          </button>
        )}
      </div>
    </details>
  );
}
