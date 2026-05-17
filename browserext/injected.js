// Draait in pagina-context (niet isolated world) — onderschept XHR van GWT
(function () {
  const CONTACT_TARGET = '/rela.person/';
  const AGENDA_TARGET = '/rela.agenda/searchAgendaDay';

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

      if (_method === 'POST' && _url.includes(CONTACT_TARGET) && body) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const params = new URLSearchParams(body);
              const data = {};
              params.forEach((v, k) => { data[k] = v; });
              window.postMessage({ type: 'REALWORKS_CONTACT', data, url: _url }, '*');
            } catch (e) {}
          }
        });
      }

      if (_method === 'POST' && _url.includes(AGENDA_TARGET)) {
        xhr.addEventListener('load', function () {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              // Haal datum range uit de request body mee als context
              const params = _body ? new URLSearchParams(_body) : new URLSearchParams();
              const meta = {
                fromdate: params.get('fromdate'),
                todate: params.get('todate'),
                employees: params.get('employees'),
              };
              window.postMessage({ type: 'REALWORKS_AGENDA', data: response, meta, url: _url }, '*');
            } catch (e) {}
          }
        });
      }

      return origSend(body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;
})();
