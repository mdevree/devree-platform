// Draait in pagina-context (niet isolated world) — onderschept XHR én form submits van GWT
(function () {
  const CONTACT_SAVE_PATH = '/rela.person/save';
  const CONTACT_XHR_TARGET = '/rela.person/';
  const AGENDA_TARGET = '/rela.agenda/searchAgendaDay';
  const TAXATIE_PATH = '/broker.taxatie/';
  const LEAD_RESPONSE_PATH = '/broker.response/save';
  const BACKUP_CAPTURE_MAX_CHARS = 200000;
  const BACKUP_CAPTURE_HOSTS = new Set(['backup.realworks.nl', 'crm.realworks.nl']);
  const BACKUP_CAPTURE_HINTS = [
    /correspond/i,
    /histor/i,
    /history/i,
    /mail/i,
    /email/i,
    /bericht/i,
    /message/i,
    /dossier/i,
    /timeline/i,
    /note/i,
    /memo/i,
    /rela\./i,
    /broker\./i,
    /servlets\/objects/i,
  ];
  const BACKUP_CAPTURE_STATIC = /\.(?:css|js|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)(?:[?#]|$)/i;
  const BACKUP_CAPTURE_TEXT = /(?:json|text|html|xml|javascript|x-www-form-urlencoded)/i;

  // Decoodeert een __MASK-waarde naar een leesbaar label
  // bv. maskString = "0;|1;Handmatig|2;Funda|6;Funda Lead", value = "6" → "Funda Lead"
  function decodeMask(value, maskString) {
    if (!maskString || value === undefined || value === null) return value;
    for (const entry of maskString.split('|')) {
      const sep = entry.indexOf(';');
      if (sep === -1) continue;
      const v = entry.slice(0, sep);
      const label = entry.slice(sep + 1);
      if (v === String(value)) return label;
    }
    return value;
  }

  function absoluteUrl(url) {
    try {
      return new URL(url, window.location.href);
    } catch {
      return null;
    }
  }

  function matchedCaptureHints(url) {
    return BACKUP_CAPTURE_HINTS
      .filter((pattern) => pattern.test(url))
      .map((pattern) => pattern.source);
  }

  function shouldCaptureRealworksNetwork(url, contentType) {
    const parsed = absoluteUrl(url);
    if (!parsed || !BACKUP_CAPTURE_HOSTS.has(parsed.hostname)) return false;
    if (BACKUP_CAPTURE_STATIC.test(parsed.pathname)) return false;

    if (parsed.hostname === 'backup.realworks.nl') {
      return !contentType || BACKUP_CAPTURE_TEXT.test(contentType);
    }

    return matchedCaptureHints(parsed.href).length > 0
      && (!contentType || BACKUP_CAPTURE_TEXT.test(contentType));
  }

  function bodyPreview(body) {
    if (!body) return '';
    if (typeof body === 'string') return body.slice(0, BACKUP_CAPTURE_MAX_CHARS);
    if (body instanceof URLSearchParams) return body.toString().slice(0, BACKUP_CAPTURE_MAX_CHARS);
    if (body instanceof FormData) {
      const fields = {};
      body.forEach((value, key) => {
        fields[key] = typeof value === 'string' ? value : `[file:${value?.name || 'unknown'}]`;
      });
      return JSON.stringify(fields).slice(0, BACKUP_CAPTURE_MAX_CHARS);
    }
    return '';
  }

  function formFieldsPreview(form) {
    const fields = {};
    try {
      for (const element of Array.from(form.elements || [])) {
        const name = element?.name;
        if (!name) continue;

        const type = String(element.type || '').toLowerCase();
        if (type === 'password' || type === 'file') {
          fields[name] = `[${type}]`;
          continue;
        }
        if ((type === 'checkbox' || type === 'radio') && !element.checked) continue;

        fields[name] = element.value ?? '';
      }
    } catch {}

    return JSON.stringify(fields).slice(0, BACKUP_CAPTURE_MAX_CHARS);
  }

  function postNetworkCapture(capture) {
    const parsed = absoluteUrl(capture.url);
    if (!parsed) return;

    window.postMessage({
      type: 'REALWORKS_BACKUP_NETWORK',
      capture: {
        source: 'realworks_network_capture',
        captured_at: new Date().toISOString(),
        host: parsed.hostname,
        path: parsed.pathname,
        query: parsed.search,
        hints: matchedCaptureHints(parsed.href),
        ...capture,
      },
    }, '*');
  }

  function postPopupCapture(capture) {
    const parsed = absoluteUrl(capture.url);

    window.postMessage({
      type: 'REALWORKS_BACKUP_NETWORK',
      capture: {
        source: 'realworks_popup_capture',
        captured_at: new Date().toISOString(),
        host: parsed?.hostname || window.location.hostname,
        path: parsed?.pathname || '',
        query: parsed?.search || '',
        hints: matchedCaptureHints(capture.url || ''),
        page_url: window.location.href,
        ...capture,
      },
    }, '*');
  }

  function postFormCapture(form, trigger) {
    if (!form) return;

    const action = form.getAttribute('action');
    const url = action && action !== 'null'
      ? (absoluteUrl(action)?.href || action)
      : window.location.href;

    if (!shouldCaptureRealworksNetwork(url, 'application/x-www-form-urlencoded')) return;

    postPopupCapture({
      source: 'realworks_form_capture',
      transport: 'form_submit',
      method: String(form.method || 'GET').toUpperCase(),
      url,
      status: null,
      content_type: form.enctype || 'application/x-www-form-urlencoded',
      form_target: form.target || '',
      form_name: form.getAttribute('name') || '',
      form_id: form.id || '',
      form_trigger: trigger,
      request_body_preview: formFieldsPreview(form),
      response_truncated: false,
      response_body: '',
    });
  }

  // Extraheert kwalificatiedata uit broker.response formuliervelden
  function extractLeadResponse(data) {
    return {
      systemid: data['_systemid'],
      resprcode: data['resprcode'],        // Realworks contactcode van de kijker
      rlisnr: data['rlisnr'],              // Objectcode (bijv. SE11845)
      contact: {
        voornaam: data['rfirstname'] || '',
        achternaam: data['rlastname'] || '',
        email: data['remail'] || '',
        telefoon: data['rtel1'] || data['rmobile'] || '',
      },
      lead: {
        herkomstCode: data['leadorigin'],
        herkomst: decodeMask(data['leadorigin'], data['leadorigin__MASK']),
        labelCode: data['leadlabel'],
        label: decodeMask(data['leadlabel'], data['leadlabel__MASK']),
        statusCode: data['leadstatus'],
        status: decodeMask(data['leadstatus'], data['leadstatus__MASK']),
      },
      // Kwalificatievragen over de kijker — voor AI-profiel en bezichtiging-prep
      kwalificatie: {
        aanvragerTypeCode: data['viewerapplicanttype'],
        aanvragerType: decodeMask(data['viewerapplicanttype'], data['viewerapplicanttype__MASK']),
        heeftEigenWoning: data['viewerhasowneroccupiedhome'] === '1',
        overwegtVerkoopWoning: data['viewerconsideringsellinghome'] === '1',
        hypotheekAdviesStatusCode: data['viewermortgageadvicestatus'],
        hypotheekAdviesStatus: decodeMask(data['viewermortgageadvicestatus'], data['viewermortgageadvicestatus__MASK']),
      },
      memo: {
        intern: data['rmemoint'] || '',    // Interne notities (wachtlijst etc.)
        publiek: data['rmemopro'] || '',   // Afspraakvoors­tellen + opmerkingen kijker
      },
      makelaarCode: data['accmanager'],
    };
  }

  // ── Formulier-submit interceptie ─────────────────────────────────────────────
  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form || !form.action) return;

    let actionPath;
    try { actionPath = new URL(form.action).pathname; } catch { return; }

    postFormCapture(form, 'submit_event');

    if (actionPath.includes(CONTACT_SAVE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({ type: 'REALWORKS_CONTACT', data, url: actionPath }, '*');
        window.postMessage({
          type: 'REALWORKS_CONTACT_RAW',
          systemid: data['_systemid'],
          fields: data,
          isMultipart: form.enctype === 'multipart/form-data',
          url: actionPath,
        }, '*');
      } catch {}
      return;
    }

    if (actionPath.includes(LEAD_RESPONSE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({
          type: 'REALWORKS_LEAD_RESPONSE',
          data: extractLeadResponse(data),
          url: actionPath,
        }, '*');
      } catch {}
      return;
    }

    if (actionPath.includes(TAXATIE_PATH)) {
      try {
        const data = {};
        new FormData(form).forEach((value, key) => {
          if (typeof value === 'string') data[key] = value;
        });

        if (!data['_systemid']) return;

        window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: actionPath }, '*');
        window.postMessage({
          type: 'REALWORKS_TAXATIE_RAW',
          systemid: data['_systemid'],
          fields: data,
          isMultipart: form.enctype === 'multipart/form-data',
          url: actionPath,
        }, '*');
      } catch {}
    }
  }, true);

  document.addEventListener('click', function (e) {
    const anchor = e.target?.closest?.('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    const onclick = anchor.getAttribute('onclick') || '';
    const target = anchor.getAttribute('target') || '';
    const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
    const url = absoluteUrl(href)?.href || href;

    if (
      target ||
      /window\.open|popup|openWindow|showmodal|showModal|modify|view|details?/i.test(onclick) ||
      /modify|view|details?|download|letter|email|mail|correspond/i.test(url)
    ) {
      postPopupCapture({
        transport: 'anchor_click',
        method: 'GET',
        url,
        status: null,
        content_type: '',
        link_text: text,
        link_target: target,
        onclick_preview: onclick.slice(0, 2000),
        request_body_preview: '',
        response_truncated: false,
        response_body: '',
      });
    }
  }, true);

  // ── HTMLFormElement.prototype.submit override ─────────────────────────────────
  // GWT roept form.submit() programmatisch aan — dat triggert geen 'submit'-event.
  const origFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (this.action) {
      let actionPath;
      try { actionPath = new URL(this.action).pathname; } catch { return origFormSubmit.call(this); }

      postFormCapture(this, 'prototype_submit');

      if (actionPath.includes(LEAD_RESPONSE_PATH)) {
        try {
          const data = {};
          new FormData(this).forEach((value, key) => {
            if (typeof value === 'string') data[key] = value;
          });
          if (data['_systemid']) {
            window.postMessage({
              type: 'REALWORKS_LEAD_RESPONSE',
              data: extractLeadResponse(data),
              url: actionPath,
            }, '*');
          }
        } catch {}
      }

      if (actionPath.includes(TAXATIE_PATH)) {
        try {
          const data = {};
          new FormData(this).forEach((value, key) => {
            if (typeof value === 'string') data[key] = value;
          });
          if (data['_systemid']) {
            window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: actionPath }, '*');
            window.postMessage({
              type: 'REALWORKS_TAXATIE_RAW',
              systemid: data['_systemid'],
              fields: data,
              isMultipart: this.enctype === 'multipart/form-data',
              url: actionPath,
            }, '*');
          }
        } catch {}
      }
    }
    return origFormSubmit.call(this);
  };

  // ── XHR interceptie ──────────────────────────────────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    let _method = 'GET';
    let _url = '';
    let _body = null;

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = method;
      _url = url;
      return origOpen(method, url, ...rest);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _body = body;

      xhr.addEventListener('load', function () {
        const contentType = xhr.getResponseHeader?.('content-type') || '';
        if (!shouldCaptureRealworksNetwork(_url, contentType)) return;

        const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : '';
        postNetworkCapture({
          transport: 'xhr',
          method: _method,
          url: _url,
          status: xhr.status,
          content_type: contentType,
          request_body_preview: bodyPreview(_body),
          response_truncated: responseText.length > BACKUP_CAPTURE_MAX_CHARS,
          response_body: responseText.slice(0, BACKUP_CAPTURE_MAX_CHARS),
        });
      });

      if (_method === 'POST' && _url.includes(CONTACT_XHR_TARGET) && body) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const data = {};
              if (body instanceof FormData) {
                body.forEach((value, key) => {
                  if (typeof value === 'string') data[key] = value;
                });
              } else {
                new URLSearchParams(body).forEach((v, k) => { data[k] = v; });
              }
              window.postMessage({ type: 'REALWORKS_CONTACT', data, url: _url }, '*');
            } catch {}
          }
        });
      }

      if (_method === 'POST' && _url.includes(TAXATIE_PATH) && body) {
        // Grid-calls (sub-tabellen die bij paginaload vuren) overslaan
        const bodyStr = typeof body === 'string' ? body : '';
        const isGridCall = bodyStr.includes('_dispatcher=gwt_json') || _url.includes('/grid');
        if (!isGridCall) {
          xhr.addEventListener('load', function () {
            if (xhr.status === 200) {
              try {
                const data = {};
                if (body instanceof FormData) {
                  body.forEach((value, key) => {
                    if (typeof value === 'string') data[key] = value;
                  });
                } else {
                  new URLSearchParams(body).forEach((v, k) => { data[k] = v; });
                }
                window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: _url }, '*');
              } catch {}
            }
          });
        }
      }

      if (_method === 'POST' && _url.includes(AGENDA_TARGET)) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              const params = _body ? new URLSearchParams(_body) : new URLSearchParams();
              const meta = {
                fromdate: params.get('fromdate'),
                todate: params.get('todate'),
                employees: params.get('employees'),
              };
              window.postMessage({ type: 'REALWORKS_AGENDA', data: response, meta, url: _url }, '*');
            } catch {}
          }
        });
      }

      return origSend(body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;

  const origWindowOpen = window.open;
  window.open = function (url, target, features) {
    const resolvedUrl = url ? (absoluteUrl(url)?.href || String(url)) : '';
    postPopupCapture({
      transport: 'window_open',
      method: 'GET',
      url: resolvedUrl,
      status: null,
      content_type: '',
      popup_target: target || '',
      popup_features: features || '',
      request_body_preview: '',
      response_truncated: false,
      response_body: '',
    });

    return origWindowOpen.apply(this, arguments);
  };

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function (input, init) {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (init?.method || request?.method || 'GET').toUpperCase();
      const requestBody = init?.body || null;

      const response = await origFetch.apply(this, arguments);
      const contentType = response.headers?.get('content-type') || '';

      if (shouldCaptureRealworksNetwork(url, contentType)) {
        response.clone().text().then((text) => {
          postNetworkCapture({
            transport: 'fetch',
            method,
            url,
            status: response.status,
            content_type: contentType,
            request_body_preview: bodyPreview(requestBody),
            response_truncated: text.length > BACKUP_CAPTURE_MAX_CHARS,
            response_body: text.slice(0, BACKUP_CAPTURE_MAX_CHARS),
          });
        }).catch(() => {});
      }

      return response;
    };
  }
})();
