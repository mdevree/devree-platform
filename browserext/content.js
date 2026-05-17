// Realworks → n8n Sync
// Injecteert een script in de pagina-context om XHR calls te onderscheppen

const WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-sync';
const AGENDA_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-agenda-sync';

// Inject in pagina-context zodat we toegang hebben tot window.XMLHttpRequest
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(s);

// Ontvang agenda data van injected.js via postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_AGENDA') return;

  // Filter UI-renderitems eruit (hebben js_do_not_open=true, zijn duplicaten voor de kalenderweergave)
  const items = (event.data.data || []).filter(item => item.js_do_not_open !== 'true');

  if (!items.length) return;

  const payload = {
    source: 'realworks',
    page_url: window.location.href,
    fromdate: event.data.meta?.fromdate,
    todate: event.data.meta?.todate,
    employees: event.data.meta?.employees,
    agenda: items,
  };

  fetch(AGENDA_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(res => {
    if (res.ok) console.log('[Realworks Agenda Sync] ✓ Verstuurd:', items.length, 'items,', payload.fromdate, '-', payload.todate);
    else console.warn('[Realworks Agenda Sync] Fout:', res.status);
  }).catch(err => console.warn('[Realworks Agenda Sync] Verbindingsfout:', err));
});

// Ontvang contact data van injected.js via postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_CONTACT') return;

  const d = event.data.data;

  if (!d.email && !d.firstname && !d.lastname) return;

  // Filter __MASK velden eruit (lange dropdown-optielijsten, niet nuttig)
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
  }).catch(err => console.warn('[Realworks Sync] Verbindingsfout:', err));
});
