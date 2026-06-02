// Draait in pagina-context (niet isolated world) — onderschept XHR én form submits van GWT
(function () {
  const CONTACT_SAVE_PATH = '/rela.person/save';
  const CONTACT_XHR_TARGET = '/rela.person/';
  const AGENDA_TARGET = '/rela.agenda/searchAgendaDay';
  const TAXATIE_PATH = '/broker.taxatie/';
  const LEAD_RESPONSE_PATH = '/broker.response/save';

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

  // ── HTMLFormElement.prototype.submit override ─────────────────────────────────
  // GWT roept form.submit() programmatisch aan — dat triggert geen 'submit'-event.
  const origFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (this.action) {
      let actionPath;
      try { actionPath = new URL(this.action).pathname; } catch { return origFormSubmit.call(this); }

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
})();
