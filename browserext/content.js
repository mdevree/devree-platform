// Realworks → n8n Sync
// Injecteert een script in de pagina-context om XHR calls te onderscheppen.
// Pingt de background service worker elke 30s zodat terugschrijftaken worden opgepakt.

let pingInterval = null;

function stopPolling() {
  clearInterval(pingInterval);
  pingInterval = null;
}

function safeSendMessage(msg) {
  try {
    if (!chrome.runtime?.id) { stopPolling(); return; }
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    stopPolling();
  }
}

function pingBackground() { safeSendMessage({ type: 'POLL_REALWORKS_TASKS' }); }
pingBackground();
pingInterval = setInterval(pingBackground, 30_000);

const WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-sync';
const AGENDA_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-agenda-sync';
const LEAD_RESPONSE_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-lead-response';
const SYNC_EVENT_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-sync/events';
const QUARANTINE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-sync/quarantine';
const PAYLOAD_VERSION = '2026-07-07';
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const recentPayloadHashes = new Map();

function isCompleteEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getWebhookSecret() {
  try {
    const { webhookSecret } = await chrome.storage.local.get('webhookSecret');
    return webhookSecret || '';
  } catch {
    return '';
  }
}

function pruneRecentHashes(now = Date.now()) {
  for (const [hash, timestamp] of recentPayloadHashes.entries()) {
    if (now - timestamp > 30_000) recentPayloadHashes.delete(hash);
  }
}

async function updateSyncStatus(patch) {
  try {
    const { realworksSyncStatus } = await chrome.storage.local.get('realworksSyncStatus');
    await chrome.storage.local.set({
      realworksSyncStatus: {
        sent: 0,
        rejected: 0,
        duplicates: 0,
        errors: 0,
        ...(realworksSyncStatus || {}),
        ...patch,
        extensionVersion: EXTENSION_VERSION,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {}
}

async function postPlatform(url, payload) {
  const secret = await getWebhookSecret();
  if (!secret) return null;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify(payload),
  });
}

function contactReasons(contact, realworksPath) {
  const reasons = [];
  if (!String(realworksPath || '').includes('/rela.person/save')) {
    reasons.push('contact-sync kwam niet van /rela.person/save');
  }
  if (!isCompleteEmail(contact.email)) {
    reasons.push('contactpayload heeft geen compleet e-mailadres');
  }
  if (!contact._systemid && !contact.systemid && !contact.rcode && !isCompleteEmail(contact.email)) {
    reasons.push('contactpayload heeft geen betrouwbare sleutel');
  }
  if (contact.woning_adres === ',' || contact.woning_adres === ' ,') {
    reasons.push('woning_adres bevat alleen een komma');
  }
  return reasons;
}

async function buildSyncEnvelope(eventType, realworksPath, payload) {
  const envelope = {
    eventType,
    source: 'realworks_browserext',
    sourceUrl: window.location.href,
    realworksPath: realworksPath || '',
    method: 'POST',
    systemid: payload._systemid || payload.systemid || '',
    rcode: payload.rcode || payload.agrcode || '',
    email: payload.email || '',
    payloadVersion: PAYLOAD_VERSION,
    extensionVersion: EXTENSION_VERSION,
    capturedAt: new Date().toISOString(),
    payload,
  };
  return {
    ...envelope,
    payloadHash: await sha256Hex(stableJson(envelope)),
  };
}

// Inject in pagina-context zodat we toegang hebben tot window.XMLHttpRequest
try {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injected.js');
  (document.head || document.documentElement).appendChild(s);
} catch {}

// Cache de formuliervelden in de background worker zodat terugschrijftaken
// de CSRF token + veldwaarden opnieuw kunnen versturen.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_CONTACT_RAW') return;

  safeSendMessage({
    type: 'CACHE_REALWORKS_FORM',
    systemid: event.data.systemid,
    fields: event.data.fields,
    isMultipart: event.data.isMultipart,
    url: event.data.url,
  });
});

// Cache de taxatie-formuliervelden in de background worker.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_TAXATIE_RAW') return;

  safeSendMessage({
    type: 'CACHE_REALWORKS_TAXATIE_FORM',
    systemid: event.data.systemid,
    fields: event.data.fields,
    isMultipart: event.data.isMultipart,
    url: event.data.url,
  });
});

// Ontvang agenda data van injected.js via postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_AGENDA') return;

  const items = (event.data.data || []).filter(item => item.js_do_not_open !== 'true');
  if (!items.length) return;

  fetch(AGENDA_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'realworks',
      page_url: window.location.href,
      fromdate: event.data.meta?.fromdate,
      todate: event.data.meta?.todate,
      employees: event.data.meta?.employees,
      agenda: items,
    })
  }).then(res => {
    if (res.ok) console.log('[Realworks Agenda Sync] ✓ Verstuurd:', items.length, 'items');
    else console.warn('[Realworks Agenda Sync] Fout:', res.status);
  }).catch(() => {});
});

// Ontvang contact data van injected.js via postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_CONTACT') return;

  handleContactSync(event.data.data, event.data.url).catch((err) => {
    console.warn('[Realworks Sync] Contact-sync fout:', err);
  });
});

async function handleContactSync(data, realworksPath) {
  const d = data || {};
  const SKIP = /(__MASK|__EDIT__|__NEW__|_grid_|_dispatcher|_collection|_entity|CSRFToken)/;
  const contact = { source: 'realworks', page_url: window.location.href };
  for (const [k, v] of Object.entries(d)) {
    if (!SKIP.test(k) && v !== '') contact[k] = v;
  }

  const envelope = await buildSyncEnvelope('contact.save', realworksPath, contact);
  const reasons = contactReasons(contact, realworksPath);

  if (reasons.length) {
    await updateSyncStatus({
      rejected: (await chrome.storage.local.get('realworksSyncStatus')).realworksSyncStatus?.rejected + 1 || 1,
      lastRejectedAt: new Date().toISOString(),
      lastRejectedReason: reasons.join('; '),
      lastRejectedPayload: { email: contact.email || '', rcode: contact.rcode || '', systemid: contact._systemid || contact.systemid || '' },
    });
    await postPlatform(QUARANTINE_URL, {
      ...envelope,
      reason: reasons.join('; '),
      severity: 'warning',
    }).catch(() => null);
    console.warn('[Realworks Sync] Payload in quarantaine:', reasons.join('; '));
    return;
  }

  const now = Date.now();
  pruneRecentHashes(now);
  if (recentPayloadHashes.has(envelope.payloadHash)) {
    recentPayloadHashes.set(envelope.payloadHash, now);
    await updateSyncStatus({
      duplicates: (await chrome.storage.local.get('realworksSyncStatus')).realworksSyncStatus?.duplicates + 1 || 1,
      lastDuplicateAt: new Date().toISOString(),
    });
    await postPlatform(SYNC_EVENT_URL, { ...envelope, status: 'duplicate', ignoredReason: 'Dubbele Realworks-save binnen 30 seconden' }).catch(() => null);
    console.log('[Realworks Sync] Dubbele save overgeslagen:', contact.email || contact.firstname);
    return;
  }
  recentPayloadHashes.set(envelope.payloadHash, now);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact)
    });
    if (res.ok) {
      await updateSyncStatus({
        sent: (await chrome.storage.local.get('realworksSyncStatus')).realworksSyncStatus?.sent + 1 || 1,
        lastSyncAt: new Date().toISOString(),
        lastSyncEmail: contact.email || '',
        lastError: '',
      });
      await postPlatform(SYNC_EVENT_URL, { ...envelope, status: 'processed', matchStrategy: 'extension_validated', matchConfidence: 100 }).catch(() => null);
      console.log('[Realworks Sync] ✓ Verstuurd:', contact.email || contact.firstname);
    } else {
      const reason = `n8n antwoordde ${res.status}`;
      await updateSyncStatus({
        errors: (await chrome.storage.local.get('realworksSyncStatus')).realworksSyncStatus?.errors + 1 || 1,
        lastError: reason,
        lastErrorAt: new Date().toISOString(),
      });
      await postPlatform(SYNC_EVENT_URL, { ...envelope, status: 'failed', ignoredReason: reason }).catch(() => null);
      console.warn('[Realworks Sync] Fout:', res.status);
    }
  } catch (err) {
    const reason = err?.message || String(err);
    await updateSyncStatus({
      errors: (await chrome.storage.local.get('realworksSyncStatus')).realworksSyncStatus?.errors + 1 || 1,
      lastError: reason,
      lastErrorAt: new Date().toISOString(),
    });
    await postPlatform(SYNC_EVENT_URL, { ...envelope, status: 'failed', ignoredReason: reason }).catch(() => null);
  }
}

// Ontvang lead response data van injected.js via postMessage
// Bevat kwalificatievragen: eigen woning, verkoopoverweging, hypotheekstatus
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_LEAD_RESPONSE') return;

  const d = event.data.data;
  if (!d?.systemid) return;

  fetch(LEAD_RESPONSE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'realworks_lead_response',
      page_url: window.location.href,
      ...d,
    })
  }).then(res => {
    if (res.ok) console.log('[Realworks Lead Response] ✓ Verstuurd:', d.resprcode, d.rlisnr);
    else console.warn('[Realworks Lead Response] Fout:', res.status);
  }).catch(() => {});
});

// Ontvang discovery-data van backup.realworks.nl. De background worker stuurt
// dit door naar het platform met het ingestelde webhook-secret.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_BACKUP_NETWORK') return;

  safeSendMessage({
    type: 'CAPTURE_REALWORKS_BACKUP',
    capture: {
      ...event.data.capture,
      page_url: window.location.href,
    },
  });
});

// REALWORKS_TAXATIE sync wordt afgehandeld door background.js via webRequest
// (onderschept op netwerkniveau bij POST naar /broker.taxatie/save).
