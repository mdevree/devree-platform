// Realworks schrijftaak service worker
// Pollt de wachtrij-API en voert Realworks veld-updates uit via de browsersessie.
//
// Werking terugschrijven:
//   1. injected.js intercepteert elke contact-POST en stuurt de raw body naar content.js
//   2. content.js stuurt die hier naartoe via CACHE_REALWORKS_FORM
//   3. Bij een schrijftaak zoeken we de gecachte body op, passen één veld aan,
//      en replayen de volledige POST (inclusief CSRF token) naar Realworks.

const QUEUE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-tasks';
const TAXATIE_QUEUE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-taxatie-tasks';
const REALWORKS_BASE = 'https://crm.realworks.nl';
const SAVE_PATH = '/servlets/objects/rela.person/grid';

// Webhook secret — zelfde als N8N_WEBHOOK_SECRET op de VPS.
// Wordt ingesteld via de opties-pagina en bewaard in chrome.storage.local,
// zodat er geen secret hardcoded in de broncode staat.
let WEBHOOK_SECRET = '';

async function loadWebhookSecret() {
  const { webhookSecret } = await chrome.storage.local.get('webhookSecret');
  WEBHOOK_SECRET = webhookSecret || '';
  return WEBHOOK_SECRET;
}

// Houd de in-memory waarde up-to-date als de gebruiker hem wijzigt.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.webhookSecret) {
    WEBHOOK_SECRET = changes.webhookSecret.newValue || '';
  }
});

// Laad direct bij het starten van de service worker.
loadWebhookSecret();

// ─── Taxatie save interceptie via webRequest ─────────────────────────────────
// form.submit() en submit-events zijn onbetrouwbaar bij GWT; webRequest
// onderschept op netwerkniveau, ongeacht hoe de form verstuurd wordt.

const TAXATIE_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-taxatie-sync';
const TAXATIE_SKIP = /(__MASK|__EDIT__|__NEW__|_grid_|_dispatcher|_collection|_entity|CSRFToken|_parentform|_callback|__FIELD_INACTIVE__|__MEDIA_LABEL__)/;

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.method !== 'POST') return;
    const raw = details.requestBody?.formData;
    if (!raw) return;

    const fields = {};
    for (const [key, values] of Object.entries(raw)) {
      fields[key] = values[0] ?? '';
    }

    if (!fields.taxcode) return;

    // Cache voor eventuele write-back taken
    if (fields._systemid) {
      chrome.storage.local.set({
        [`rw_taxatie_form_${fields._systemid}`]: {
          fields,
          isMultipart: false,
          url: '/servlets/objects/broker.taxatie/save',
        },
      });
      console.log(`[RW Taxatie Cache] Gecached via webRequest: ${fields._systemid} (${fields.taxcode})`);
    }

    // Stuur naar n8n webhook
    const taxatie = { source: 'realworks' };
    for (const [k, v] of Object.entries(fields)) {
      if (!TAXATIE_SKIP.test(k) && v !== '') taxatie[k] = v;
    }

    fetch(TAXATIE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taxatie),
    }).then(res => {
      if (res.ok) console.log('[RW Taxatie Sync] ✓ Verstuurd:', fields.taxcode);
      else console.warn('[RW Taxatie Sync] Fout:', res.status);
    }).catch(err => console.warn('[RW Taxatie Sync] Netwerkfout:', err));
  },
  {
    urls: ['https://crm.realworks.nl/servlets/objects/broker.taxatie/save'],
    types: ['sub_frame', 'main_frame'],
  },
  ['requestBody']
);

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

  if (message.type === 'CACHE_REALWORKS_TAXATIE_FORM') {
    const key = `rw_taxatie_form_${message.systemid}`;
    chrome.storage.local.set({ [key]: {
      fields: message.fields,
      isMultipart: message.isMultipart,
      url: message.url,
    }});
    console.log(`[RW Taxatie Cache] Gecached: ${message.systemid} (${message.isMultipart ? 'multipart' : 'urlencoded'}, url=${message.url})`);
    return;
  }

  if (message.type === 'POLL_REALWORKS_TASKS') {
    Promise.all([pollAndExecute(), pollAndExecuteTaxatie()])
      .then(([rel, tax]) => sendResponse({ rel, tax }));
    return true; // async response
  }
});

// ─── Polling ─────────────────────────────────────────────────────────────────

// Fallback alarm elke minuut voor het geval het content script niet actief is.
chrome.alarms.create('realworks-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'realworks-poll') {
    pollAndExecute();
    pollAndExecuteTaxatie();
  }
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

async function pollAndExecuteTaxatie() {
  let tasks;
  try {
    const res = await fetch(TAXATIE_QUEUE_URL, {
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    });
    if (!res.ok) { console.warn('[RW Taxatie Tasks] Poll mislukt:', res.status); return { ok: false }; }
    ({ tasks } = await res.json());
  } catch (err) {
    console.warn('[RW Taxatie Tasks] Netwerkfout bij poll:', err);
    return { ok: false };
  }

  if (!tasks?.length) return { ok: true, count: 0 };
  console.log(`[RW Taxatie Tasks] ${tasks.length} taak(en) gevonden`);

  for (const task of tasks) await processTaxatieTask(task);
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

async function processTaxatieTask(task) {
  const claimed = await patchTaxatieTask(task.id, { status: 'processing' });
  if (!claimed) return;

  try {
    if (task.taskType === 'write_field') {
      await writeRealworksTaxatieField(task);
    } else {
      throw new Error(`Onbekend taskType: ${task.taskType}`);
    }
    await patchTaxatieTask(task.id, { status: 'done' });
    console.log(`[RW Taxatie Tasks] ✓ Taak ${task.id} afgerond (${task.fieldName}=${task.fieldValue})`);
  } catch (err) {
    const error = err?.message || String(err);
    await patchTaxatieTask(task.id, { status: 'failed', error });
    console.warn(`[RW Taxatie Tasks] ✗ Taak ${task.id} mislukt:`, error);
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

  // Verouderde /grid cache is onbruikbaar — verwijder hem en vraag om nieuwe cache.
  if (cached.url && cached.url.includes('/grid')) {
    await chrome.storage.local.remove(cacheKey);
    throw new Error(
      `Verouderde cache (grid-URL) voor contact ${task.realworksRelationId} verwijderd. ` +
      `Open en sla het contact opnieuw op in Realworks zodat de extensie de /save cache kan vullen.`
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

async function patchTaxatieTask(id, data) {
  try {
    const res = await fetch(`${TAXATIE_QUEUE_URL}/${id}`, {
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
    console.warn('[RW Taxatie Tasks] Kon taakstatus niet bijwerken:', err);
    return false;
  }
}

/**
 * Schrijft één veld naar een Realworks taxatierapport door de gecachte form body
 * te replayen met het gewijzigde veld.
 *
 * De gecachte body bevat de CSRF token die geldig is zolang de sessie actief is.
 * De cache wordt gevuld door injected.js zodra de taxatievorm wordt verstuurd.
 */
async function writeRealworksTaxatieField(task) {
  const cacheKey = `rw_taxatie_form_${task.realworksTaxatieId}`;
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];

  if (!cached) {
    throw new Error(
      `Geen gecachede formulierdata voor taxatie ${task.realworksTaxatieId}. ` +
      `Open het taxatierapport in Realworks zodat de extensie de data kan cachen.`
    );
  }

  const fieldCount = cached.fields != null ? Object.keys(cached.fields).length : 0;
  console.log(`[RW Taxatie Tasks] Cache '${cacheKey}': ${fieldCount} velden, url=${cached.url}`);

  const postUrl = cached.url.startsWith('http')
    ? cached.url
    : `${REALWORKS_BASE}${cached.url}`;
  console.log(`[RW Taxatie Tasks] POST naar: ${postUrl} (multipart=${cached.isMultipart})`);

  const fields = { ...cached.fields, [task.fieldName]: task.fieldValue };
  console.log(`[RW Taxatie Tasks] Veld '${task.fieldName}': '${cached.fields[task.fieldName]}' → '${task.fieldValue}'`);

  const fetchHeaders = {
    'Origin': REALWORKS_BASE,
    'Referer': `${REALWORKS_BASE}/servlets/objects/broker.taxatie/modify`,
  };

  let body;
  if (cached.isMultipart) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    body = fd;
  } else {
    body = new URLSearchParams(fields).toString();
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
  console.log(`[RW Taxatie Tasks] Realworks antwoord: ${res.status} (url=${res.url})`);
  console.log(`[RW Taxatie Tasks] Response body (500 chars):`, responseText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Realworks antwoordde ${res.status}: ${responseText.slice(0, 300)}`);
  }

  const finalUrl = res.url || postUrl;
  if (!finalUrl.includes('/servlets/') && finalUrl.includes('/login')) {
    throw new Error(`Sessie verlopen — redirect naar login (${finalUrl})`);
  }
}
