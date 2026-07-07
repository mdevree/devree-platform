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
const WONING_QUEUE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-woning-tasks';
const BACKUP_CAPTURE_URL = 'https://kantoor.devreemakelaardij.nl/api/realworks-backup-captures';
const OTD_REALWORKS_INTAKE_URL = 'https://kantoor.devreemakelaardij.nl/api/otd/intake/realworks';
const REALWORKS_BASE = 'https://crm.realworks.nl';
const BACKUP_CAPTURE_MAX_CHARS = 200000;
const relationGridReplayKeys = new Set();
const searchersGraphqlReplayKeys = new Set();
const pendingSearchersGraphqlRequests = new Map();
let realworksApiTokenCache = { token: '', expiresAt: 0 };

// Decodeert een __MASK-waarde naar een leesbaar label.
// bv. maskString = "0;|1;Vrijstaande woning|4;Tussenwoning", value = "4" → "Tussenwoning"
function decodeMask(value, maskString) {
  if (!maskString || value === undefined || value === null || value === '') return value;
  for (const entry of maskString.split('|')) {
    const sep = entry.indexOf(';');
    if (sep === -1) continue;
    if (entry.slice(0, sep) === String(value)) return entry.slice(sep + 1);
  }
  return value;
}

function bodyFromWebRequest(details) {
  const raw = details.requestBody?.formData;
  if (!raw && !details.requestBody?.raw) return '';

  if (raw) {
    const params = new URLSearchParams();
    for (const [key, values] of Object.entries(raw)) {
      for (const value of values || ['']) params.append(key, value ?? '');
    }
    return params.toString();
  }

  try {
    const decoder = new TextDecoder('utf-8');
    return (details.requestBody.raw || [])
      .map((part) => part.bytes ? decoder.decode(part.bytes) : '')
      .join('');
  } catch {
    return '';
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(value) {
  return decodeHtml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRelationEntityFromGridRow(row) {
  const html = (row.columns || []).map((column) => column.content || '').join('\n');
  const decoded = decodeHtml(html);
  const entityMatch = decoded.match(/new Entity\("rela\.(?:relation|person)",\s*\d+,\s*(\{.*?\})\),\s*event/s);
  let entity = null;

  if (entityMatch) {
    try { entity = JSON.parse(entityMatch[1]); } catch {}
  }

  const nameMatch = decoded.match(/<a[^>]+onclick="openRelation\((\d+)\);"[^>]*>(.*?)<\/a>/s);
  const emailMatch = decoded.match(/GridUtils\.newMailUsingAddress\("([^"]+)"/);

  return {
    systemid: String(entity?.systemid || row.rowAttributes?.systemid || nameMatch?.[1] || ''),
    rcode: String(entity?.rcode || ''),
    rtype: String(entity?.rtype || row.rowAttributes?.rtype || ''),
    entityKey: row.rowAttributes?._entity_key || '',
    name: entity?.company
      || [entity?.title, entity?.firstname, entity?.middlename, entity?.lastname].filter(Boolean).join(' ')
      || stripHtml(nameMatch?.[2] || ''),
    email: entity?.email || emailMatch?.[1] || '',
    phone: entity?.tel1 || '',
    mobile: entity?.mobile || '',
    address: {
      street: entity?.hstreet || entity?.mstreet || entity?.ostreet || '',
      houseNumber: entity?.hhouseno || entity?.mhouseno || entity?.ohouseno || '',
      houseNumberAddition: entity?.hhousenoext || entity?.mhousenoext || entity?.ohousenoext || '',
      zipcode: entity?.hzipcode || entity?.mzipcode || entity?.ozipcode || '',
      city: entity?.hcity || entity?.mcity || entity?.ocity || '',
    },
    lastUpdated: entity?.rlastup || '',
    inactive: entity?.rinactive === true,
    alertnote: entity?.alertnote || '',
  };
}

function parseRelationGrid(responseText) {
  let rows;
  try { rows = JSON.parse(responseText); } catch { return []; }
  if (!Array.isArray(rows)) return [];

  return rows
    .map(parseRelationEntityFromGridRow)
    .filter((row) => row.systemid || row.rcode || row.email || row.name);
}

function parseJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));
    return decoded.exp ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getRealworksApiToken() {
  const now = Date.now();
  if (realworksApiTokenCache.token && realworksApiTokenCache.expiresAt > now + 60_000) {
    return realworksApiTokenCache.token;
  }

  const res = await fetch('https://crm.realworks.nl/apitoken/', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (!res.ok) throw new Error(`/apitoken/ gaf ${res.status}`);

  const text = (await res.text()).trim();
  let token = text.replace(/^"|"$/g, '');
  try {
    const json = JSON.parse(text);
    token = json.token || json.accessToken || json.apiToken || json.jwt || token;
  } catch {}

  if (!token || token.length < 20) throw new Error('/apitoken/ gaf geen bruikbare token');

  realworksApiTokenCache = {
    token,
    expiresAt: parseJwtExpiry(token) || now + 10 * 60_000,
  };
  return token;
}

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

// ─── Woning (object) save interceptie via webRequest ─────────────────────────
// broker.brokerobject/save is een multipart GWT-form; net als bij taxatie is
// form.submit()-interceptie onbetrouwbaar, dus we lezen op netwerkniveau.

const WONING_WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-woning-sync';
const WONING_SKIP = /(__MASK|__EDIT__|__NEW__|_grid_|_dispatcher|_collection|_entity|CSRFToken|_parentform|_callback|__FIELD_INACTIVE__|__MEDIA_LABEL__|__NO__FIELD__|multipleFileUpload|\.default$|__maxrec$)/;

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.method !== 'POST') return;
    const raw = details.requestBody?.formData;
    if (!raw) return;

    const fields = {};
    for (const [key, values] of Object.entries(raw)) {
      fields[key] = values[0] ?? '';
    }

    // objectcode/lisnr identificeert de woning; sla grid- en deelcalls over.
    if (!fields.objectcode && !fields.lisnr) return;

    // Cache voor eventuele write-back taken (key op _systemid).
    if (fields._systemid) {
      chrome.storage.local.set({
        [`rw_woning_form_${fields._systemid}`]: {
          fields,
          isMultipart: true,
          url: '/servlets/objects/broker.brokerobject/save',
        },
        [`rw_object_code_${fields._systemid}`]: fields.objectcode || fields.lisnr || '',
      });
      console.log(`[RW Woning Cache] Gecached via webRequest: ${fields._systemid} (${fields.objectcode || fields.lisnr})`);
    }

    // Bouw payload: filter interne velden weg en decodeer __MASK-enums naar labels.
    const woning = { source: 'realworks' };
    for (const [k, v] of Object.entries(fields)) {
      if (WONING_SKIP.test(k) || v === '') continue;
      woning[k] = v;
      const mask = fields[`${k}__MASK`];
      if (mask) woning[`${k}_label`] = decodeMask(v, mask);
    }

    fetch(WONING_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(woning),
    }).then(res => {
      if (res.ok) console.log('[RW Woning Sync] ✓ Verstuurd:', fields.objectcode || fields.lisnr);
      else console.warn('[RW Woning Sync] Fout:', res.status);
    }).catch(err => console.warn('[RW Woning Sync] Netwerkfout:', err));

    if (WEBHOOK_SECRET) {
      fetch(OTD_REALWORKS_INTAKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          ...woning,
          data: woning,
          eventType: fields.lisstate === '13' ? 'otd.ready' : 'verkoop.project.sync',
          source: 'realworks_browserext',
          realworksPath: '/servlets/objects/broker.brokerobject/save',
          capturedAt: new Date().toISOString(),
        }),
      }).then(res => {
        if (res.ok) console.log('[RW OTD/Project Intake] ✓ Verstuurd:', fields.objectcode || fields.lisnr);
        else console.warn('[RW OTD/Project Intake] Fout:', res.status);
      }).catch(err => console.warn('[RW OTD/Project Intake] Netwerkfout:', err));
    }
  },
  {
    urls: ['https://crm.realworks.nl/servlets/objects/broker.brokerobject/save'],
    types: ['sub_frame', 'main_frame'],
  },
  ['requestBody']
);

// ─── Relatie-grid uitlezen ───────────────────────────────────────────────────
// De zoekresultaten-grid bevat het Realworks systemid dat we nodig hebben om
// later contacthistorie en correspondentie op te halen.

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.method !== 'POST') return;

    const body = bodyFromWebRequest(details);
    if (!body) return;

    const replayKey = `${details.url}\n${body}`;
    if (relationGridReplayKeys.has(replayKey)) {
      relationGridReplayKeys.delete(replayKey);
      return;
    }

    replayRelationGrid(details.url, body);
  },
  {
    urls: ['https://crm.realworks.nl/servlets/objects/*/grid*'],
    types: ['xmlhttprequest', 'sub_frame', 'main_frame'],
  },
  ['requestBody']
);

async function replayRelationGrid(url, body) {
  try {
    const replayKey = `${url}\n${body}`;
    relationGridReplayKeys.add(replayKey);
    setTimeout(() => relationGridReplayKeys.delete(replayKey), 10_000);

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      body,
    });

    const text = await res.text();
    const rows = parseRelationGrid(text);
    const parsedUrl = new URL(url);

    await captureRealworksBackup({
      source: rows.length ? 'realworks_relation_grid' : 'realworks_grid_debug',
      captured_at: new Date().toISOString(),
      host: parsedUrl.hostname,
      path: parsedUrl.pathname,
      query: parsedUrl.search,
      hints: [parsedUrl.pathname, 'background_webrequest_replay'],
      transport: 'background_webrequest_replay',
      method: 'POST',
      url,
      page_url: '',
      status: res.status,
      content_type: res.headers.get('content-type') || '',
      request_body_preview: JSON.stringify({
        count: rows.length,
        rows,
        request: body.slice(0, BACKUP_CAPTURE_MAX_CHARS),
      }).slice(0, BACKUP_CAPTURE_MAX_CHARS),
      response_truncated: text.length > BACKUP_CAPTURE_MAX_CHARS,
      response_body: rows.length ? '' : text.slice(0, BACKUP_CAPTURE_MAX_CHARS),
    });
  } catch (err) {
    console.warn('[RW Relation Grid] Replay mislukt:', err);
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.method !== 'POST') return;

    const body = bodyFromWebRequest(details);
    if (!body || !body.match(/"operationName":"(GetSearchers|GetSearcherById|GetSearchResults)"/)) return;

    const replayKey = `${details.url}\n${body}`;
    if (searchersGraphqlReplayKeys.has(replayKey)) {
      searchersGraphqlReplayKeys.delete(replayKey);
      return;
    }

    pendingSearchersGraphqlRequests.set(details.requestId, { url: details.url, body });
    setTimeout(() => pendingSearchersGraphqlRequests.delete(details.requestId), 10_000);
  },
  {
    urls: ['https://crm.realworks.nl/api/aankoop/graphql'],
    types: ['xmlhttprequest'],
  },
  ['requestBody']
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (details) {
    const pending = pendingSearchersGraphqlRequests.get(details.requestId);
    if (!pending) return;
    pendingSearchersGraphqlRequests.delete(details.requestId);

    const headers = {};
    for (const header of details.requestHeaders || []) {
      const name = header.name.toLowerCase();
      if ([
        'accept',
        'authorization',
        'origin',
        'referer',
        'x-csrf-token',
        'x-xsrf-token',
        'x-realworks-token',
      ].includes(name)) {
        headers[header.name] = header.value || '';
      }
    }

    replaySearchersGraphql(pending.url, pending.body, headers);
  },
  {
    urls: ['https://crm.realworks.nl/api/aankoop/graphql'],
    types: ['xmlhttprequest'],
  },
  ['requestHeaders', 'extraHeaders']
);

async function replaySearchersGraphql(url, body, requestHeaders = {}) {
  try {
    const replayKey = `${url}\n${body}`;
    searchersGraphqlReplayKeys.add(replayKey);
    setTimeout(() => searchersGraphqlReplayKeys.delete(replayKey), 10_000);

    let request = {};
    try { request = JSON.parse(body); } catch {}
    const operationName = request.operationName || 'UnknownGraphqlOperation';
    const originalAuth = requestHeaders.Authorization || requestHeaders.authorization;
    const authHeader = originalAuth || `Bearer ${await getRealworksApiToken()}`;

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...requestHeaders,
        'Authorization': authHeader,
      },
      body,
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}

    const searchers = data?.data?.searchers;
    const searcher = data?.data?.searcher || data?.data?.searcherById;
    const searchResults = data?.data?.searchResults;
    const searcherEdges = Array.isArray(searchers?.edges) ? searchers.edges : [];
    const resultEdges = Array.isArray(searchResults?.edges) ? searchResults.edges : [];

    await captureRealworksBackup({
      source: operationName === 'GetSearchResults'
        ? 'realworks_search_results_graphql'
        : operationName === 'GetSearcherById'
        ? 'realworks_searcher_detail_graphql'
        : 'realworks_searchers_graphql',
      captured_at: new Date().toISOString(),
      host: 'crm.realworks.nl',
      path: '/api/aankoop/graphql',
      query: '',
      hints: ['aankoop/graphql', operationName],
      transport: 'background_graphql_replay',
      method: 'POST',
      url,
      page_url: '',
      status: res.status,
      content_type: res.headers.get('content-type') || '',
      request_body_preview: JSON.stringify({
        totalCount: searchers?.totalCount ?? null,
        resultTotalCount: searchResults?.totalCount ?? null,
        count: searcherEdges.length || resultEdges.length || (searcher ? 1 : 0),
        searchers: searcher ? [searcher] : searcherEdges,
        results: resultEdges,
        request,
      }).slice(0, BACKUP_CAPTURE_MAX_CHARS),
      response_truncated: text.length > BACKUP_CAPTURE_MAX_CHARS,
      response_body: searcherEdges.length || resultEdges.length || searcher ? '' : text.slice(0, BACKUP_CAPTURE_MAX_CHARS),
    });
  } catch (err) {
    console.warn('[RW Searchers GraphQL] Replay mislukt:', err);
  }
}

// Tijdelijke discovery voor vernieuwde Realworks-schermen: logt alleen
// request-metadata van XHRs, zonder responses opnieuw op te vragen.
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    const url = new URL(details.url);
    if (url.pathname.match(/\.(?:css|js|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i)) return;

    const body = bodyFromWebRequest(details);
    captureRealworksBackup({
      source: 'realworks_xhr_probe',
      captured_at: new Date().toISOString(),
      host: url.hostname,
      path: url.pathname,
      query: url.search,
      hints: ['xhr_probe'],
      transport: 'background_webrequest_probe',
      method: details.method,
      url: details.url,
      page_url: '',
      status: null,
      content_type: '',
      request_body_preview: body.slice(0, 10000),
      response_truncated: false,
      response_body: '',
    });
  },
  {
    urls: ['https://crm.realworks.nl/*'],
    types: ['xmlhttprequest'],
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

  if (message.type === 'CAPTURE_REALWORKS_BACKUP') {
    captureRealworksBackup(message.capture);
    return;
  }

  if (message.type === 'POLL_REALWORKS_TASKS') {
    Promise.all([pollAndExecute(), pollAndExecuteTaxatie(), pollAndExecuteWoning()])
      .then(([rel, tax, won]) => sendResponse({ rel, tax, won }));
    return true; // async response
  }
});

async function captureRealworksBackup(capture) {
  if (!capture?.url) return;

  try {
    const res = await fetch(BACKUP_CAPTURE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify(capture),
    });

    if (res.ok) {
      console.log('[RW Backup Capture] ✓ Verstuurd:', capture.method, capture.url);
    } else {
      console.warn('[RW Backup Capture] Fout:', res.status, capture.url);
    }
  } catch (err) {
    console.warn('[RW Backup Capture] Netwerkfout:', err);
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

// Fallback alarm elke minuut voor het geval het content script niet actief is.
chrome.alarms.create('realworks-poll', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'realworks-poll') {
    pollAndExecute();
    pollAndExecuteTaxatie();
    pollAndExecuteWoning();
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

async function pollAndExecuteWoning() {
  let tasks;
  try {
    const res = await fetch(WONING_QUEUE_URL, {
      headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    });
    if (!res.ok) { console.warn('[RW Woning Tasks] Poll mislukt:', res.status); return { ok: false }; }
    ({ tasks } = await res.json());
  } catch (err) {
    console.warn('[RW Woning Tasks] Netwerkfout bij poll:', err);
    return { ok: false };
  }

  if (!tasks?.length) return { ok: true, count: 0 };
  console.log(`[RW Woning Tasks] ${tasks.length} taak(en) gevonden`);

  for (const task of tasks) await processWoningTask(task);
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

async function processWoningTask(task) {
  const claimed = await patchWoningTask(task.id, { status: 'processing' });
  if (!claimed) return;

  try {
    if (task.taskType === 'write_field') {
      await writeRealworksWoningField(task);
    } else {
      throw new Error(`Onbekend taskType: ${task.taskType}`);
    }
    await patchWoningTask(task.id, { status: 'done' });
    console.log(`[RW Woning Tasks] ✓ Taak ${task.id} afgerond (${task.fieldName}=${task.fieldValue})`);
  } catch (err) {
    const error = err?.message || String(err);
    await patchWoningTask(task.id, { status: 'failed', error });
    console.warn(`[RW Woning Tasks] ✗ Taak ${task.id} mislukt:`, error);
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

async function patchWoningTask(id, data) {
  try {
    const res = await fetch(`${WONING_QUEUE_URL}/${id}`, {
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
    console.warn('[RW Woning Tasks] Kon taakstatus niet bijwerken:', err);
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

/**
 * Schrijft één veld naar een Realworks woning (object) door de gecachte form body
 * te replayen met het gewijzigde veld.
 *
 * Realworks gebruikt een multipart GWT full-form POST naar
 * /servlets/objects/broker.brokerobject/save. De gecachte body bevat de CSRF token
 * die geldig is zolang de sessie actief is; de cache wordt gevuld door de
 * webRequest-interceptie zodra de woning wordt opgeslagen in Realworks.
 */
async function writeRealworksWoningField(task) {
  const cacheKey = `rw_woning_form_${task.realworksWoningId}`;
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];

  if (!cached) {
    throw new Error(
      `Geen gecachede formulierdata voor woning ${task.realworksWoningId}. ` +
      `Open en sla de woning op in Realworks zodat de extensie de data kan cachen.`
    );
  }

  const fieldCount = cached.fields != null ? Object.keys(cached.fields).length : 0;
  console.log(`[RW Woning Tasks] Cache '${cacheKey}': ${fieldCount} velden, url=${cached.url}`);

  const postUrl = cached.url.startsWith('http')
    ? cached.url
    : `${REALWORKS_BASE}${cached.url}`;
  console.log(`[RW Woning Tasks] POST naar: ${postUrl} (multipart=${cached.isMultipart})`);

  const fields = { ...cached.fields, [task.fieldName]: task.fieldValue };
  console.log(`[RW Woning Tasks] Veld '${task.fieldName}': '${cached.fields[task.fieldName]}' → '${task.fieldValue}'`);

  const fetchHeaders = {
    'Origin': REALWORKS_BASE,
    'Referer': `${REALWORKS_BASE}/servlets/objects/broker.brokerobject/modify`,
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
  console.log(`[RW Woning Tasks] Realworks antwoord: ${res.status} (url=${res.url})`);
  console.log(`[RW Woning Tasks] Response body (500 chars):`, responseText.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Realworks antwoordde ${res.status}: ${responseText.slice(0, 300)}`);
  }

  const finalUrl = res.url || postUrl;
  if (!finalUrl.includes('/servlets/') && finalUrl.includes('/login')) {
    throw new Error(`Sessie verlopen — redirect naar login (${finalUrl})`);
  }
}
