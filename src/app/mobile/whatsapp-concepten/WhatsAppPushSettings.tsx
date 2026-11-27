"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BellIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { signOut } from "next-auth/react";
import { DRAFTS_PATH, isWhatsAppDraftId, whatsappDraftLoginPath } from "@/lib/whatsappDraftLinks";
import WhatsAppWebPushSettings from "./WhatsAppWebPushSettings";

type BridgeRequest =
  | { action: "status" | "enable" }
  | { action: "clear"; inactiveIds: string[] }
  | { action: "sync"; activeDraftIds: string[]; readStartedAt: number };
type PushDevice = {
  deviceId: string;
  token?: string;
  environment: "development" | "production";
  publicKey?: string;
  authorized: boolean;
  previewSetting: "always" | "whenAuthenticated" | "never" | "unknown";
};
type Preferences = { office: boolean; personal: boolean };

const endpoint = "/api/mobile/whatsapp-push";

class PushSettingsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function bridge() {
  const nativeWindow = window as Window & {
    webkit?: { messageHandlers?: { whatsappPush?: { postMessage: (message: BridgeRequest) => void } } };
  };
  return nativeWindow.webkit?.messageHandlers?.whatsappPush;
}

export function clearDraftNotifications(inactiveIds: string[]) {
  if (!inactiveIds.length) return;
  bridge()?.postMessage({ action: "clear", inactiveIds });
  const inactive = new Set(inactiveIds);
  void closeWebNotifications((draft) => inactive.has(draft));
}

export function syncDraftNotifications(activeDraftIds: string[], readStartedAt: number) {
  bridge()?.postMessage({ action: "sync", activeDraftIds, readStartedAt });
  const open = new Set(activeDraftIds);
  void closeWebNotifications((draft, timestamp) => timestamp > 0 && timestamp <= readStartedAt && !open.has(draft));
}

async function closeWebNotifications(shouldClose: (draft: string, timestamp: number) => boolean) {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(DRAFTS_PATH);
    if (!registration?.getNotifications || registration.scope !== new URL(DRAFTS_PATH, location.origin).href) return;
    for (const notification of await registration.getNotifications()) {
      const { draft, shownAt } = notification.data ?? {};
      if (isWhatsAppDraftId(draft) && shouldClose(draft, typeof shownAt === "number" ? shownAt : 0)) notification.close();
    }
  } catch {
    // The current concept list remains authoritative if the browser cannot close notifications.
  }
}

async function readPreferences(id: string): Promise<Preferences> {
  const response = await fetch(`${endpoint}?deviceId=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Meldingsvoorkeuren konden niet worden geladen.");
  return response.json();
}

async function savePreferences(device: PushDevice, preferences: Preferences): Promise<Preferences> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: device.deviceId,
      token: device.token,
      environment: device.environment,
      publicKey: device.publicKey,
      ...preferences,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PushSettingsError(result?.error ?? "Meldingsvoorkeuren konden niet worden opgeslagen.", response.status);
  }
  return result;
}

function pushSettingsMode() {
  return bridge() ? "native" : "web";
}

const noModeUpdates = () => () => {};

export default function WhatsAppPushSettings({ personalAvailable }: { personalAvailable: boolean }) {
  const mode = useSyncExternalStore(noModeUpdates, pushSettingsMode, () => "loading");
  if (mode === "native") return <NativeWhatsAppPushSettings personalAvailable={personalAvailable} />;
  if (mode === "web") return <WhatsAppWebPushSettings personalAvailable={personalAvailable} />;
  return null;
}

function NativeWhatsAppPushSettings({ personalAvailable }: { personalAvailable: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [device, setDevice] = useState<PushDevice | null>(null);
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [choices, setChoices] = useState<Preferences>({ office: false, personal: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requiresLogin, setRequiresLogin] = useState(false);
  const pending = useRef<Preferences | null>(null);
  const synced = useRef("");
  const writing = useRef(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const native = bridge();
    if (!native) return;
    const controller = new AbortController();
    let active = true;

    async function receiveDevice(raw: Event) {
      const next = (raw as CustomEvent<PushDevice>).detail;
      if (!next?.deviceId) return;
      const version = ++requestVersion.current;
      setAvailable(true);
      setDevice(next);
      const waiting = pending.current;
      if (!waiting && writing.current) return;
      try {
        if (waiting && (!next.authorized || !next.token || !next.publicKey)) {
          if (next.authorized) return;
          pending.current = null;
          writing.current = false;
          setSaving(false);
          setError("Sta meldingen voor De Vree Platform toe in de iPhone-instellingen en probeer opnieuw.");
          return;
        }

        if (waiting) {
          pending.current = null;
          const updated = await savePreferences(next, waiting);
          if (!active) return;
          synced.current = JSON.stringify([next.deviceId, next.token, next.environment, next.publicKey]);
          setSaved(updated);
          setChoices(updated);
          setMessage("Meldingsvoorkeuren opgeslagen.");
          writing.current = false;
          setSaving(false);
          return;
        }

        const settings = await readPreferences(next.deviceId);
        if (!active || version !== requestVersion.current || writing.current) return;
        const firstRead = !synced.current;
        setSaved((previous) => previous ?? settings);
        if (firstRead) setChoices(settings);

        const credentials = JSON.stringify([next.deviceId, next.token, next.environment, next.publicKey]);
        if (synced.current === credentials) return;
        if (next.authorized && next.token && next.publicKey && (settings.office || settings.personal)) {
          // An existing opt-in follows APNs token or key changes on this device.
          writing.current = true;
          setSaving(true);
          try {
            await savePreferences(next, settings);
          } finally {
            writing.current = false;
            if (active) setSaving(false);
          }
        }
        synced.current = credentials;
      } catch (failure) {
        if (!active) return;
        if (waiting) {
          writing.current = false;
          setSaving(false);
        }
        setRequiresLogin(failure instanceof PushSettingsError && [401, 409].includes(failure.status));
        setError((failure as Error).message);
      }
    }

    function requestStatus() {
      if (document.visibilityState === "visible") native?.postMessage({ action: "status" });
    }

    window.addEventListener("devree-whatsapp-push-device", receiveDevice, { signal: controller.signal });
    document.addEventListener("visibilitychange", requestStatus, { signal: controller.signal });
    requestStatus();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!saving || !pending.current) return;
    const timeout = window.setTimeout(() => {
      if (!pending.current) return;
      pending.current = null;
      writing.current = false;
      setSaving(false);
      setError("De iPhone heeft de meldingstoegang nog niet bevestigd. Probeer opnieuw.");
    }, 30_000);
    return () => window.clearTimeout(timeout);
  }, [saving]);

  async function save() {
    if (!device || writing.current) return;
    const desired = { office: choices.office, personal: personalAvailable && choices.personal };
    ++requestVersion.current;
    writing.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    setRequiresLogin(false);
    if ((desired.office || desired.personal) && (!device.authorized || !device.token || !device.publicKey)) {
      pending.current = desired;
      bridge()?.postMessage({ action: "enable" });
      return;
    }

    try {
      const updated = await savePreferences(device, desired);
      synced.current = JSON.stringify([device.deviceId, device.token, device.environment, device.publicKey]);
      setSaved(updated);
      setChoices(updated);
      setMessage("Meldingsvoorkeuren opgeslagen.");
    } catch (failure) {
      setRequiresLogin(failure instanceof PushSettingsError && [401, 409].includes(failure.status));
      setError((failure as Error).message);
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  if (!available) return null;
  const dirty = saved && (choices.office !== saved.office || choices.personal !== saved.personal);
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 py-3 font-medium">
        <BellIcon className="h-5 w-5 text-primary" aria-hidden="true" />
        WhatsApp-meldingen
        <ChevronDownIcon className="ml-auto size-4 text-gray-600 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-4 py-4 text-sm">
        <p className="text-gray-600">Meldingen op deze iPhone tonen de naam en een korte samenvatting.</p>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={choices.office}
            disabled={saving || !saved}
            onChange={(event) => setChoices({ ...choices, office: event.target.checked })}
            className="size-5 accent-primary"
          />
          Kantoorconcepten
        </label>
        {personalAvailable && (
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={choices.personal}
              disabled={saving || !saved}
              onChange={(event) => setChoices({ ...choices, personal: event.target.checked })}
              className="size-5 accent-primary"
            />
            Persoonlijke concepten
          </label>
        )}
        {(choices.office || choices.personal) && device?.previewSetting !== "whenAuthenticated" && (
          <p className="rounded-lg bg-gray-50 p-3 text-gray-700">
            Kies op je iPhone bij Instellingen → Meldingen → De Vree Platform → Toon voorvertoning
            voor ‘Indien ontgrendeld’.
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Opslaan…" : "Voorkeuren opslaan"}
        </button>
        {message && <p role="status" className="text-gray-700">{message}</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {requiresLogin && (
          <button
            type="button"
            className="min-h-11 font-semibold text-primary underline"
            onClick={() => void signOut({ redirectTo: whatsappDraftLoginPath() })}
          >
            Opnieuw inloggen
          </button>
        )}
      </div>
    </details>
  );
}
