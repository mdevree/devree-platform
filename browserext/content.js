// Realworks → n8n Sync
// Injecteert een script in de pagina-context om XHR calls te onderscheppen

const WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-sync';

// Inject in pagina-context zodat we toegang hebben tot window.XMLHttpRequest
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(s);

// Ontvang data van injected.js via postMessage
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== 'REALWORKS_CONTACT') return;

  const d = event.data.data;

  const contact = {
    firstname:  d.firstname || d.christianname || '',
    lastname:   d.lastname || '',
    initials:   d.initials || '',
    email:      d.email || '',
    mobile:     d.mobile || '',
    phone:      d.tel2 || d.tel1 || '',
    address:    [d.hstreet, d.hhouseno, d.hhousenoext].filter(Boolean).join(' ').trim(),
    zipcode:    d.hzipcode || '',
    city:       d.hcity || '',
    salutation: d.saluation || '',
    sex:        d.sex || '',
    title:      d.title || '',
    typerela:   d.typerela || '',
    systemid:   d._systemid || '',
    rcode:      d.rcode || '',
    rtype:      d.rtype || '',
    source:     'realworks',
    page_url:   window.location.href,
  };

  if (!contact.email && !contact.firstname && !contact.lastname) return;

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact)
  }).then(res => {
    if (res.ok) console.log('[Realworks Sync] ✓ Verstuurd:', contact.email || contact.firstname);
    else console.warn('[Realworks Sync] Fout:', res.status);
  }).catch(err => console.warn('[Realworks Sync] Verbindingsfout:', err));
});
