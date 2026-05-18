// Realworks schrijftaak service worker
// Pollt de wachtrij-API en voert Realworks veld-updates uit via de browsersessie.

const QUEUE_URL = 'https://platform.devreemakelaardij.nl/api/realworks-tasks';
const REALWORKS_BASE = 'https://crm.realworks.nl';

// Vul de webhook secret in via chrome.storage of hardcode voor intern gebruik.
// Aanbevolen: sla op via de extension opties of een omgevingsvariabele bij build.
const WEBHOOK_SECRET = 'VULL_IN_MET_N8N_WEBHOOK_SECRET';

// Polling interval in seconden (30s via content script ping, zie content.js)
// De service worker wacht op berichten van het content script en reageert dan.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'POLL_REALWORKS_TASKS') {
    pollAndExecute().then(result => sendResponse(result));
    return true; // async response
  }
});

// Fallback: alarm elke minuut voor het geval het content script niet actief is
chrome.alarms.create('realworks-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'realworks-poll') {
    pollAndExecute();
  }
});

async function pollAndExecute() {
  let tasks;
  try {
    const res = await fetch(QUEUE_URL, {
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    });
    if (!res.ok) {
      console.warn('[RW Tasks] Poll mislukt:', res.status);
      return { ok: false };
    }
    ({ tasks } = await res.json());
  } catch (err) {
    console.warn('[RW Tasks] Netwerkfout bij poll:', err);
    return { ok: false };
  }

  if (!tasks?.length) return { ok: true, count: 0 };

  console.log(`[RW Tasks] ${tasks.length} taak(en) gevonden`);

  for (const task of tasks) {
    await processTask(task);
  }

  return { ok: true, count: tasks.length };
}

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

/**
 * Schrijft één veld naar een Realworks contact.
 *
 * Realworks gebruikt een GWT-gebaseerde POST naar /rela.person/{id}.
 * De body is URL-encoded form data.
 *
 * Opmerking: de exacte veldnamen voor "vrije velden" in Realworks zijn te vinden via
 * DevTools → Network terwijl je handmatig een vrij veld opslaat in Realworks CRM.
 * Zoek naar een POST op /rela.person/ en kijk welke key de vrij veld waarde draagt.
 *
 * Veelvoorkomende patronen: "vrij_veld_1", "persoon_vrij_veld_1", of iets als "p_free1".
 */
async function writeRealworksField(task) {
  const url = `${REALWORKS_BASE}/rela.person/${task.realworksRelationId}`;

  const body = new URLSearchParams();
  body.append(task.fieldName, task.fieldValue);

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include', // stuurt Realworks sessie cookies mee
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Realworks antwoordde ${res.status}: ${text.slice(0, 200)}`);
  }
}

// Geeft true terug als de update gelukt is, false bij 409 (al geclaimd) of netwerkkfout.
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
