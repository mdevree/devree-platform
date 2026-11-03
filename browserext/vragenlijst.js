// Dedicated capture: no form replay, cookies, tokens or seller identities.
(function () {
  const filter = { urls: ['https://crm.realworks.nl/servlets/objects/broker.nvmvragenlijst/saveQuestionlist*'] };
  const pending = new Map();
  const prefix = 'rw_vl_outbox_';
  let flushing = false;
  function sanitize(raw) {
    const keep = new Set(['vllisnr', '_systemid', 'versienummer', 'lijstcode', 'vllastupd', 'changedbycustomer']);
    for (const key of Object.keys(raw)) {
      if (/^answer_\d+(?:__MASK)?$/.test(key)) keep.add(key);
    }
    return Object.fromEntries([...keep].filter(k => typeof raw[k] === 'string').map(k => [k, raw[k]]));
  }
  chrome.webRequest.onBeforeRequest.addListener(details => {
    if (details.method !== 'POST') return;
    const fields = sanitize(Object.fromEntries(new URLSearchParams(bodyFromWebRequest(details))));
    if (!fields.vllisnr || !fields._systemid) return;
    const key = `rw_vl_pending_${details.requestId}`;
    const value = { captureId: crypto.randomUUID(), capturedAt: new Date().toISOString(), fields };
    const save = chrome.storage.session.set({ [key]: value });
    pending.set(details.requestId, save);
  }, filter, ['requestBody']);
  chrome.webRequest.onCompleted.addListener(async details => {
    await pending.get(details.requestId);
    pending.delete(details.requestId);
    const key = `rw_vl_pending_${details.requestId}`;
    const data = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    if (!data || details.statusCode < 200 || details.statusCode >= 300) return;
    await chrome.storage.local.set({ [prefix + data.captureId]: { ...data, status: details.statusCode } });
    await flush();
  }, filter);
  chrome.webRequest.onErrorOccurred.addListener(async details => {
    await pending.get(details.requestId);
    pending.delete(details.requestId);
    await chrome.storage.session.remove(`rw_vl_pending_${details.requestId}`);
  }, filter);
  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      const secret = await loadWebhookSecret();
      if (!secret) return;
      const all = await chrome.storage.local.get(null);
      for (const [key, payload] of Object.entries(all).filter(([k]) => k.startsWith(prefix))) {
        try {
          const res = await fetch('https://kantoor.devreemakelaardij.nl/api/realworks-vragenlijst', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
          });
          const result = await res.json().catch(() => null);
          if (!res.ok || result?.ok !== true) throw new Error(result?.error || `HTTP ${res.status}`);
          await chrome.storage.local.remove(key);
          await chrome.storage.local.set({ realworksVragenlijstStatus: { objectcode: payload.fields.vllisnr, receivedAt: new Date().toISOString(), items: result.items, error: null } });
          console.log('[RW Vragenlijst] Ontvangen in platform:', payload.fields.vllisnr);
        } catch (error) {
          await chrome.storage.local.set({ realworksVragenlijstStatus: { objectcode: payload.fields.vllisnr, error: String(error.message || error), failedAt: new Date().toISOString() } });
          console.warn('[RW Vragenlijst] Nog niet ontvangen; blijft in wachtrij:', payload.fields.vllisnr);
        }
      }
    } finally { flushing = false; }
  }
  chrome.alarms.create('realworks-vragenlijst', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'realworks-vragenlijst') void flush(); });
})();
