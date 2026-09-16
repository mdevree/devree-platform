// Pure contact matching. Embedded in n8n by scripts/build-realworks-contact-workflow.mjs.
(function (root) {
  const text = (v) => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  const id = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const name = (v) => text(v).normalize('NFKC').toLocaleLowerCase('nl').replace(/\s+/g, ' ');
  const fail = (code, reason, statusCode = 409) => ({ status: 'error', code, reason, statusCode });
  const fields = (contact) => contact?.fields?.all || {};

  function identityConflict(mapped, contact) {
    const existing = fields(contact);
    return ['realworks_code', 'systemid'].some((key) =>
      text(mapped[key]) && text(existing[key]) && text(mapped[key]) !== text(existing[key]));
  }

  function lookupRequests(mapped) {
    const queries = [];
    for (const kind of ['realworks_code', 'systemid', 'email']) {
      if (!text(mapped[kind])) continue;
      const value = kind === 'email' ? text(mapped[kind]).toLowerCase() : text(mapped[kind]);
      const query = `where[0][col]=${kind}&where[0][expr]=eq&where[0][val]=${encodeURIComponent(value)}&limit=2`;
      queries.push({ kind, value, url: `https://connect.devreemakelaardij.nl/api/contacts?${query}` });
    }
    if (id(mapped._mauticContactId)) {
      queries.push({ kind: 'field1', value: String(id(mapped._mauticContactId)),
        url: `https://connect.devreemakelaardij.nl/api/contacts/${id(mapped._mauticContactId)}` });
    }
    return queries;
  }

  function resolveContact(mapped, responses, allowedFields) {
    const expected = lookupRequests(mapped);
    if (!expected.length || responses.length !== expected.length) {
      return fail('lookup_failed', 'Contactcontrole gaf geen volledig antwoord.', 502);
    }
    const hits = {};
    for (let index = 0; index < expected.length; index++) {
      const query = expected[index];
      const response = responses[index];
      if (response?.statusCode === 404 && query.kind === 'field1') continue;
      if (!response || response.error || !Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode >= 300 || !response.body) {
        return fail('lookup_failed', 'Mautic-contactcontrole mislukt; er is niets aangemaakt.', 502);
      }
      let contacts;
      if (query.kind === 'field1') {
        contacts = response.body.contact ? [response.body.contact] : null;
      } else {
        if (!response.body.contacts || typeof response.body.contacts !== 'object'
          || !Number.isInteger(Number(response.body.total))) {
          return fail('lookup_failed', 'Mautic-contactcontrole gaf een ongeldig antwoord.', 502);
        }
        contacts = Object.values(response.body.contacts);
        const total = Number(response.body.total);
        if (total > 1 || contacts.length > 1) return fail('ambiguous_identity', 'Meerdere Mautic-contacten hebben dezelfde identificatie.');
        if (total !== contacts.length) return fail('lookup_failed', 'Mautic-contactcontrole is onvolledig.', 502);
      }
      if (!contacts || contacts.some((c) => !id(c.id) || !c.fields?.all)) {
        return fail('lookup_failed', 'Mautic-contactcontrole mist contactgegevens.', 502);
      }
      const contact = contacts[0];
      if (!contact) continue;
      const returnedValue = query.kind === 'field1' ? String(contact.id) : text(fields(contact)[query.kind]);
      if ((query.kind === 'email' ? returnedValue.toLowerCase() : returnedValue) !== query.value) {
        return fail('lookup_failed', 'Mautic-contactcontrole leverde geen exacte overeenkomst.', 502);
      }
      hits[query.kind] = contact;
    }

    const stableHits = [hits.realworks_code, hits.systemid].filter(Boolean);
    if (new Set(stableHits.map((c) => id(c.id))).size > 1) {
      return fail('conflicting_identity', 'Realworks-relatiecode en systeem-ID wijzen naar verschillende contacten.');
    }
    let target = stableHits[0] || hits.field1;
    let strategy = hits.realworks_code ? 'realworks_code' : hits.systemid ? 'systemid' : hits.field1 ? 'mautic_id' : 'new';
    if (hits.field1 && target && id(hits.field1.id) !== id(target.id)) {
      return fail('conflicting_identity', 'Het Mautic-ID in Realworks hoort bij een ander contact.');
    }
    if (id(mapped._mauticContactId) && !hits.field1 && !stableHits.length) {
      return fail('stale_mautic_id', 'Het Mautic-ID bestaat niet en er is geen eenduidige Realworks-match.');
    }
    if (target && identityConflict(mapped, target)) {
      return fail('conflicting_identity', 'Het gevonden contact heeft een andere Realworks-identificatie.');
    }
    if (hits.email && target && id(hits.email.id) !== id(target.id)) {
      return fail('email_in_use', 'Dit e-mailadres hoort al bij een ander Mautic-contact.');
    }
    if (!target && hits.email) {
      const candidate = hits.email;
      const existing = fields(candidate);
      if (identityConflict(mapped, candidate) || ['firstname', 'lastname'].some((key) =>
        name(mapped[key]) && name(existing[key]) && name(mapped[key]) !== name(existing[key]))) {
        return fail('email_identity_conflict', 'Het contact met dit e-mailadres heeft een andere naam of Realworks-identificatie.');
      }
      target = candidate;
      strategy = 'email';
    }

    const writeFields = {};
    for (const key of allowedFields) {
      if (mapped[key] === undefined || mapped[key] === null || !text(mapped[key])) continue;
      writeFields[key] = key === 'email' ? text(mapped[key]).toLowerCase() : mapped[key];
    }
    return { status: 'ready', statusCode: 200, matchStrategy: strategy, mapped, fields: writeFields,
      mauticContactId: target ? id(target.id) : null,
      method: target ? 'PATCH' : 'POST',
      url: target ? `https://connect.devreemakelaardij.nl/api/contacts/${id(target.id)}/edit`
        : 'https://connect.devreemakelaardij.nl/api/contacts/new' };
  }

  function checkWrite(response, plan) {
    if (!response || response.error || !Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode >= 300
      || !id(response.body?.contact?.id)) {
      return fail('write_failed', 'Mautic kon het contact niet opslaan; probeer opnieuw.', 502);
    }
    const contactId = id(response.body.contact.id);
    if (plan.mauticContactId && contactId !== plan.mauticContactId) {
      return fail('unexpected_contact', 'Mautic gaf een onverwacht contact-ID terug.', 502);
    }
    return { ...plan, status: 'written', mauticContactId: contactId,
      url: `https://connect.devreemakelaardij.nl/api/contacts/${contactId}` };
  }

  function verifyContact(response, written) {
    if (!response || response.error || response.statusCode !== 200
      || id(response.body?.contact?.id) !== written.mauticContactId) {
      return fail('verification_failed', 'Het opgeslagen contact kon niet worden teruggelezen.', 502);
    }
    const actual = fields(response.body.contact);
    for (const key of ['realworks_code', 'systemid', 'email', 'firstname', 'lastname']) {
      if (text(written.fields[key]) && text(actual[key]) !== text(written.fields[key])) {
        return fail('verification_failed', 'De teruggelezen contactgegevens komen niet overeen met de opgeslagen gegevens.', 502);
      }
    }
    return { status: 'ok', statusCode: 200, id: written.mauticContactId,
      mauticContactId: written.mauticContactId, matchStrategy: written.matchStrategy,
      needsWriteBack: Boolean(text(written.mapped.systemid) && id(written.mapped._mauticContactId) !== written.mauticContactId) };
  }

  root.RealworksContactMatching = { lookupRequests, resolveContact, checkWrite, verifyContact };
})(globalThis);
