// Shared by the Chrome extension and the generated n8n contact branch.
// Keep this file free of browser/n8n APIs so the same rules can be tested in Node.
(function (root) {
  function text(value) {
    return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      ? String(value).trim() : '';
  }

  function identifier(value) {
    const valueText = text(value);
    return /^(0|null|undefined)$/i.test(valueText) ? '' : valueText;
  }

  function completeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
  }

  function contactReasons(contact, realworksPath) {
    const reasons = [];
    const email = text(contact.email);
    const systemid = identifier(contact._systemid) || identifier(contact.systemid);
    const rcode = identifier(contact.rcode);
    if (!text(realworksPath).split('?')[0].endsWith('/rela.person/save')) {
      reasons.push('contact-sync kwam niet van /rela.person/save');
    }
    if (email && !completeEmail(email)) reasons.push('contactpayload heeft geen compleet e-mailadres');
    if (!systemid && !rcode && !completeEmail(email)) reasons.push('contactpayload heeft geen betrouwbare sleutel');
    if (!email && !text(contact.firstname) && !text(contact.lastname)) {
      reasons.push('contact zonder e-mailadres heeft geen voornaam of achternaam');
    }
    if (text(contact.woning_adres).replace(/\s/g, '') === ',') {
      reasons.push('woning_adres bevat alleen een komma');
    }
    return reasons;
  }

  function hashMaterial(realworksPath, contact) {
    const payload = {};
    for (const [key, value] of Object.entries(contact)) {
      if (!['page_url', 'sourceUrl', 'capturedAt', 'traceId', 'payloadHash', '_sync'].includes(key)) {
        payload[key] = value;
      }
    }
    return { eventType: 'contact.save', realworksPath, payload };
  }

  function confirmedResponse(response) {
    return response?.status === 'ok' && Number.isSafeInteger(response.mauticContactId)
      && response.mauticContactId > 0 && typeof response.matchStrategy === 'string'
      && response.matchStrategy.length > 0;
  }

  root.RealworksContactSync = { text, identifier, completeEmail, contactReasons, hashMaterial, confirmedResponse };
})(globalThis);
