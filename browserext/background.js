// Realworks schrijftaak service worker
// Pollt de wachtrij-API en voert Realworks veld-updates uit via de browsersessie.
//
// Werking terugschrijven:
//   1. injected.js intercepteert elke contact-POST en stuurt de raw body naar content.js
//   2. content.js stuurt die hier naartoe via CACHE_REALWORKS_FORM
//   3. Bij een schrijftaak zoeken we de gecachte body op, passen één veld aan,
//      en replayen de volledige POST (inclusief CSRF token) naar Realworks.

const QUEUE_URL = 'https://platform.devreemakelaardij.nl/api/realworks-tasks';
const REALWORKS_BASE = 'https://crm.realworks.nl';
const SAVE_PATH = '/servlets/objects/rela.person/grid';

// Webhook secret — zelfde als N8N_WEBHOOK_SECRET op de VPS.
const WEBHOOK_SECRET = 'VULL_IN_MET_N8N_WEBHOOK_SECRET';

// ─── Berichten van content script ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CACHE_REALWORKS_FORM') {
    // Sla de raw form body op per systemid. TTL niet nodig: CSRF token is geldig
    // zolang de Realworks sessie actief is (kantooruren).
    chrome.storage.local.set({
      [`rw_form_${message.systemid}`]: { body: message.body, url: message.url },
    });
    return;
  }

  if (message.type === 'POLL_REALWORKS_TASKS') {
    pollAndExecute().then(result => sendResponse(result));
    return true; // async response
  }
});

// ─── Polling ─────────────────────────────────────────────────────────────────

// Fallback alarm elke minuut voor het geval het content script niet actief is.
chrome.alarms.create('realworks-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'realworks-poll') pollAndExecute();
});

async function pollAndExecute() {
  let tasks;
  try {
    const res = await fetch(QUEUE_URL, {
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    });
    if (!res.ok) { console.warn('[RW Tasks] Poll mislukt:', res.status); return { ok: false }; }
    ({ tasks } = await res.json());
  } catch (err) {
    console.warn('[RW Tasks] Netwerkfout bij poll:', err);
    return { ok: false };
  }

  if (!tasks?.length) return { ok: true, count: 0 };
  console.log(`[RW Tasks] ${tasks.length} taak(en) gevonden`);

  for (const task of tasks) await processTask(task);
  return { ok: true, count: tasks.length };
}

// ─── Taakverwerking ──────────────────────────────────────────────────────────

async function processTask(task) {
  // Atomische claim: slaagt alleen als status nog "pending" is.
  // Bij 409 heeft een andere extensie de taak al geclaimd — overslaan.
  const claimed = await patchTask(task.id, { status: 'processing' });
  if (!claimed) return;

  try {
    if (task.taskType === 'write_field') {
      await writeRealworksField(task);
    } else {
      throw new Error(`Onbekend taskType: ${task.taskType}`);
    }
    await patchTask(task.id, { status: 'done' });
    console.log(`[RW Tasks] ✓ Taak ${task.id} afgerond (${task.fieldName}=${task.fieldValue})`);
  } catch (err) {
    const error = err?.message || String(err);
    await patchTask(task.id, { status: 'failed', error });
    console.warn(`[RW Tasks] ✗ Taak ${task.id} mislukt:`, error);
  }
}

// ─── Realworks veld terugschrijven ───────────────────────────────────────────

/**
 * Schrijft één vrij veld naar een Realworks contact door de gecachte form body
 * te replayen met het gewijzigde veld.
 *
 * Realworks gebruikt een GWT full-form POST naar /servlets/objects/rela.person/grid.
 * Vrije velden heten field1 t/m field5 in de form body.
 *
 * De gecachte body bevat de CSRF token die geldig is zolang de sessie actief is.
 * De cache wordt gevuld door injected.js zodra het contact wordt opgeslagen in Realworks.
 */
async function writeRealworksField(task) {
  const cacheKey = `rw_form_${task.realworksRelationId}`;
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];

  if (!cached) {
    throw new Error(
      `Geen gecachede formulierdata voor contact ${task.realworksRelationId}. ` +
      `Open en sla het contact op in Realworks zodat de extensie de data kan cachen.`
    );
  }

  // Parse de opgeslagen body, pas het doel-veld aan, bewaar de rest ongewijzigd.
  const params = new URLSearchParams(cached.body);
  params.set(task.fieldName, task.fieldValue);

  // Gebruik dezelfde URL als de originele POST (relatief of absoluut).
  const postUrl = cached.url.startsWith('http')
    ? cached.url
    : `${REALWORKS_BASE}${cached.url}`;

  // Stuur de volledige form body terug inclusief CSRF token en alle andere velden.
  const res = await fetch(postUrl, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': REALWORKS_BASE,
      'Referer': `${REALWORKS_BASE}/servlets/objects/rela.person/modify`,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Realworks antwoordde ${res.status}: ${text.slice(0, 300)}`);
  }
}

// ─── Hulpfunctie ─────────────────────────────────────────────────────────────

// Geeft true als de update gelukt is, false bij 409 (al geclaimd) of netwerkfout.
async function patchTask(id, data) {
  try {
    const res = await fetch(`${QUEUE_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(data),
    });
    if (res.status === 409) return false;
    return res.ok;
  } catch (err) {
    console.warn('[RW Tasks] Kon taakstatus niet bijwerken:', err);
    return false;
  }
}
