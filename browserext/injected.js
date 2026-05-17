// Draait in pagina-context (niet isolated world) — onderschept XHR van GWT
(function () {
  const TARGET = '/rela.person/';

  const OrigXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new OrigXHR();
    let _method = 'GET';
    let _url = '';

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url, ...rest) {
      _method = method;
      _url = url;
      return origOpen(method, url, ...rest);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      if (_method === 'POST' && _url.includes(TARGET) && body) {
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
      return origSend(body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OrigXHR.prototype;
})();
