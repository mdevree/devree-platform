// Draait in pagina-context (niet isolated world) — onderschept XHR én form submits van GWT
(function () {
  const CONTACT_SAVE_PATH = '/rela.person/save';
  const CONTACT_XHR_TARGET = '/rela.person/';
  const AGENDA_TARGET = '/rela.agenda/searchAgendaDay';
  const TAXATIE_PATH = '/broker.taxatie/';

  // ── Formulier-submit interceptie ─────────────────────────────────────────────
  // Zowel contact-save als taxatie-save zijn echte formulier-navigaties in een iframe
  // (sec-fetch-mode: navigate, sec-fetch-dest: iframe) — NIET gevangen door XHR.
  // We onderscheppen het submit-event vóór de navigatie.
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
      } catch (_) {}
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
      } catch (_) {}
    }
  }, true); // capture-fase: vóór de navigatie

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
              // Alleen REALWORKS_CONTACT via XHR (n8n sync).
              // REALWORKS_CONTACT_RAW gaat via de form-submit listener hierboven.
              window.postMessage({ type: 'REALWORKS_CONTACT', data, url: _url }, '*');
            } catch (_) {}
          }
        });
      }

      if (_method === 'POST' && _url.includes(TAXATIE_PATH) && body) {
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
              // Alleen REALWORKS_TAXATIE via XHR (n8n sync).
              // REALWORKS_TAXATIE_RAW gaat via de form-submit listener hierboven.
              window.postMessage({ type: 'REALWORKS_TAXATIE', data, url: _url }, '*');
            } catch (_) {}
          }
        });
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
            } catch (_) {}
          }
        });
      }

      return origSend(body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;
})();
