// Realworks schrijftaak service worker
// Pollt de wachtrij-API en voert Realworks veld-updates uit via de browsersessie.
//
// Werking terugschrijven:
//   1. injected.js intercepteert elke contact-POST en stuurt de raw body naar content.js
//   2. content.js stuurt die hier naartoe via CACHE_REALWORKS_FORM
//   3. Bij een schrijftaak zoeken we de gecachte body op, passen één veld aan,
//      en replayen de volledige POST (inclusief CSRF token) naar Realworks.

const QUEUE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-tasks';
const REALWORKS_BASE = 'https://crm.realworks.nl';
const SAVE_PATH = '/servlets/objects/rela.person/grid';

// Webhook secret — zelfde als N8N_WEBHOOK_SECRET op de VPS.
const WEBHOOK_SECRET = 'VULL_IN_MET_N8N_WEBHOOK_SECRET';

// ─── Berichten van content script ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CACHE_REALWORKS_FORM') {
    // Sla de formuliervelden op per systemid. CSRF token is geldig zolang
    // de Realworks sessie actief is (kantooruren).
    // Gooi stale /grid-cache weg als de nieuwe /save-cache binnenkomt.
    const key = `rw_form_${message.systemid}`;
    chrome.storage.local.get(key, (existing) => {
      const old = existing[key];
      if (old && !message.isMultipart && old.isMultipart) {
        // Nieuw is URL-encoded /grid, oud is multipart /save — bewaar de /save cache.
        console.log(`[RW Cache] /grid POST genegeerd — /save cache al aanwezig voor ${message.systemid}`);
        return;
      }
      chrome.storage.local.set({ [key]: {
        fields: message.fields,
        isMultipart: message.isMultipart,
        url: message.url,
      }});
      console.log(`[RW Cache] Gecached: ${message.systemid} (${message.isMultipart ? 'multipart' : 'urlencoded'}, url=${message.url})`);
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

  // Ondersteuning voor zowel nieuw formaat (fields-object) als oud formaat (raw body-string).
  const hasNewFormat = cached.fields != null;
  const fieldCount = hasNewFormat ? Object.keys(cached.fields).length : (cached.body?.length ?? 0);
  console.log(`[RW Tasks] Cache '${cacheKey}': ${hasNewFormat ? fieldCount + ' velden' : fieldCount + ' chars (oud formaat)'}, url=${cached.url}`);

  const postUrl = cached.url.startsWith('http')
    ? cached.url
    : `${REALWORKS_BASE}${cached.url}`;
  console.log(`[RW Tasks] POST naar: ${postUrl} (multipart=${cached.isMultipart})`);

  let body;
  const fetchHeaders = {
    'Origin': REALWORKS_BASE,
    'Referer': `${REALWORKS_BASE}/servlets/objects/rela.person/modify`,
  };

  if (hasNewFormat) {
    const fields = { ...cached.fields, [task.fieldName]: task.fieldValue };
    console.log(`[RW Tasks] Veld '${task.fieldName}': '${cached.fields[task.fieldName]}' → '${task.fieldValue}'`);

    if (cached.isMultipart) {
      // Herbouw als FormData — browser voegt automatisch de juiste boundary toe.
      // Lege file-velden (media, idscanid_file) zijn weggelaten; de server laat
      // die dan ongewijzigd (foto / id-scan blijven intact).
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      body = fd;
      // Content-Type NIET zetten — browser zet hem inclusief boundary.
    } else {
      body = new URLSearchParams(fields).toString();
      fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  } else {
    // Oud formaat: raw URL-encoded body-string (cache van /grid-endpoint).
    const params = new URLSearchParams(cached.body);
    console.log(`[RW Tasks] Veld '${task.fieldName}' (oud): '${params.get(task.fieldName)}' → '${task.fieldValue}'`);
    params.set(task.fieldName, task.fieldValue);
    body = params.toString();
    fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  let res;
  try {
    res = await fetch(postUrl, {
      method: 'POST',
      credentials: 'include',
      headers: fetchHeaders,
      body,
    });
  } catch (fetchErr) {
    throw new Error(`Fetch mislukt (netwerk?): ${fetchErr?.message}`);
  }

  const responseText = await res.text().catch(() => '');
  console.log(`[RW Tasks] Realworks antwoord: ${res.status} (url=${res.url})`);
  console.log(`[RW Tasks] Response body (500 chars):`, responseText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Realworks antwoordde ${res.status}: ${responseText.slice(0, 300)}`);
  }

  const finalUrl = res.url || postUrl;
  if (!finalUrl.includes('/servlets/') && finalUrl.includes('/login')) {
    throw new Error(`Sessie verlopen — redirect naar login (${finalUrl})`);
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
