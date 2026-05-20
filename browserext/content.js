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
const TAXATIE_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-taxatie-sync';

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

  const d = event.data.data;
  if (!d.email && !d.firstname && !d.lastname) return;

  const SKIP = /(__MASK|__EDIT__|__NEW__|_grid_|_dispatcher|_collection|_entity|CSRFToken)/;
  const contact = { source: 'realworks', page_url: window.location.href };
  for (const [k, v] of Object.entries(d)) {
    if (!SKIP.test(k) && v !== '') contact[k] = v;
  }

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact)
  }).then(res => {
    if (res.ok) console.log('[Realworks Sync] ✓ Verstuurd:', contact.email || contact.firstname);
    else console.warn('[Realworks Sync] Fout:', res.status);
  }).catch(() => {});
});

// REALWORKS_TAXATIE sync wordt afgehandeld door background.js via webRequest
// (onderschept op netwerkniveau bij POST naar /broker.taxatie/save).
