import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { validateRealworksContactPayload } from './realworksSync';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const sharedCode = read('browserext/contact-sync.js');
const matchingCode = read('n8n/lib/realworks-contact-matching.js');
const allowedFields = JSON.parse(read('n8n/lib/realworks-contact-fields.json')) as string[];
type Fields = Record<string, string>;
type Contact = { id: number; fields: { all: Fields } };
type Reply = { statusCode?: number; body?: unknown; error?: string };
type Plan = { status: string; code?: string; fields?: Fields; mauticContactId?: number | null;
  matchStrategy?: string; needsWriteBack?: boolean; [key: string]: unknown };
const sandbox = vm.createContext({});
vm.runInContext(sharedCode + matchingCode, sandbox);
const shared = sandbox.RealworksContactSync as {
  contactReasons: (data: Fields, path: string) => string[];
  confirmedResponse: (data: unknown) => boolean;
};
const matching = sandbox.RealworksContactMatching as {
  lookupRequests: (data: Fields) => { kind: string; value: string }[];
  resolveContact: (data: Fields, responses: Reply[], allowed: string[]) => Plan;
  checkWrite: (response: Reply, plan: Plan) => Plan;
  verifyContact: (response: Reply, written: Plan) => Plan;
};
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const contact = (id: number, values: Fields = {}): Contact => ({ id, fields: { all: values } });
const mapped = (values: Fields = {}): Fields => ({ firstname: 'Sync', lastname: 'Test', realworks_code: 'qa-1', systemid: '123', email: '', ...values });
function replies(data: Fields, hits: Record<string, Contact[] | Reply> = {}): Reply[] {
  return matching.lookupRequests(data).map((query) => {
    const hit = hits[query.kind] || [];
    if (!Array.isArray(hit)) return hit;
    return query.kind === 'field1'
      ? hit.length ? { statusCode: 200, body: { contact: hit[0] } } : { statusCode: 404, body: {} }
      : { statusCode: 200, body: { total: hit.length, contacts: Object.fromEntries(hit.map((c) => [c.id, c])) } };
  });
}
const resolve = (data: Fields, hits: Record<string, Contact[] | Reply> = {}) =>
  matching.resolveContact(data, replies(data, hits), allowedFields);

test('platform, extensie en n8n delen de validatieregels voor ontbrekende e-mail', () => {
  const cases: [Fields, string, boolean][] = [
    [{ _systemid: '123', firstname: 'Sync' }, '/rela.person/save', true],
    [{ rcode: 'qa-1', lastname: 'Test', email: ' ' }, '/rela.person/save', true],
    [{ rcode: 'qa-1', lastname: 'Test', email: 'ongeldig' }, '/rela.person/save', false],
    [{ firstname: 'Sync' }, '/rela.person/save', false],
    [{ _systemid: '0', firstname: 'Sync' }, '/rela.person/save', false],
    [{ _systemid: '123' }, '/rela.person/save', false],
    [{ _systemid: '123', firstname: 'Sync' }, '/rela.person/save-extra', false],
    [{ firstname: 'Sync', email: 'sync@example.invalid' }, '/rela.person/save', true],
  ];
  for (const [data, path, valid] of cases) {
    const reasons = shared.contactReasons(data, path);
    assert.equal(reasons.length === 0, valid);
    assert.deepEqual(validateRealworksContactPayload({ eventType: 'contact.save', realworksPath: path, data }), plain(reasons));
    assert.deepEqual(validateRealworksContactPayload({ eventType: 'contact.save', realworksPath: path, payload: data }), plain(reasons));
  }
});

test('nieuw contact zonder e-mail krijgt beide Realworks-identifiers, zonder leeg emailveld', () => {
  const plan = resolve(mapped());
  assert.equal(plan.status, 'ready');
  assert.equal(plan.method, 'POST');
  assert.equal(plan.fields?.realworks_code, 'qa-1');
  assert.equal(plan.fields?.systemid, '123');
  assert.equal('email' in plan.fields!, false);
});

test('later toegevoegd en gewijzigd e-mailadres blijft bij hetzelfde contact', () => {
  const existing = contact(55, { ...mapped(), email: 'oud@example.invalid' });
  const data = mapped({ email: 'NIEUW@example.invalid' });
  const plan = resolve(data, { realworks_code: [existing], systemid: [existing] });
  assert.equal(plan.mauticContactId, 55);
  assert.equal(plan.method, 'PATCH');
  assert.equal(plan.fields?.email, 'nieuw@example.invalid');
});

test('opnieuw opslaan zonder teruggeschreven field1 vindt hetzelfde contact', () => {
  const data = mapped();
  const existing = contact(55, data);
  const plan = resolve(data, { realworks_code: [existing], systemid: [existing] });
  assert.equal(plan.mauticContactId, 55);
  assert.equal(plan.matchStrategy, 'realworks_code');
  assert.equal('email' in plan.fields!, false);
});

test('systemid is voldoende als rcode nog ontbreekt', () => {
  const data = mapped({ realworks_code: '' });
  const plan = resolve(data, { systemid: [contact(55, data)] });
  assert.equal(plan.mauticContactId, 55);
  assert.equal(plan.matchStrategy, 'systemid');
});

test('naamwijziging bij een vaste match blijft toegestaan', () => {
  const data = mapped({ lastname: 'van Test' });
  const plan = resolve(data, { realworks_code: [contact(55, { ...data, lastname: 'Test' })] });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.fields?.lastname, 'van Test');
});

test('conflicterende Realworks-identifiers en field1 stoppen vóór de schrijfactie', () => {
  const data = mapped({ _mauticContactId: '66' });
  const first = contact(55, mapped());
  const other = contact(66, { realworks_code: 'qa-2', systemid: '456' });
  assert.equal(resolve(data, { realworks_code: [first], field1: [other] }).code, 'conflicting_identity');
  assert.equal(resolve(mapped(), { realworks_code: [first], systemid: [contact(66, { systemid: '123' })] }).code, 'conflicting_identity');
});

test('niet-bestaand field1 wordt alleen via een vaste Realworks-match hersteld', () => {
  const data = mapped({ _mauticContactId: '999' });
  assert.equal(resolve(data, { realworks_code: [contact(55, mapped())] }).mauticContactId, 55);
  assert.equal(resolve(data).code, 'stale_mautic_id');
});

test('emailmatch vereist overeenkomende identiteit en gebruikt nooit alleen naam of telefoon', () => {
  const data = mapped({ email: 'sync@example.invalid' });
  const same = contact(55, { firstname: 'Sync', lastname: 'Test', email: data.email });
  assert.equal(resolve(data, { email: [same] }).matchStrategy, 'email');
  assert.equal(resolve(data, { email: [contact(55, { ...same.fields.all, firstname: 'Ander' })] }).code, 'email_identity_conflict');
  assert.equal(resolve(data, { email: [contact(55, { ...same.fields.all, realworks_code: 'qa-2' })] }).code, 'email_identity_conflict');
  assert.deepEqual(plain(matching.lookupRequests(data)).map((q) => q.kind), ['realworks_code', 'systemid', 'email']);
});

test('e-mailadres van een ander contact wordt niet overgenomen', () => {
  const data = mapped({ email: 'gedeeld@example.invalid' });
  assert.equal(resolve(data, { realworks_code: [contact(55, mapped())],
    email: [contact(66, { email: data.email })] }).code, 'email_in_use');
});

test('meerdere exacte matches, zoekfouten en onvolledige API-antwoorden maken nooit een contact aan', () => {
  const data = mapped();
  assert.equal(resolve(data, { realworks_code: [contact(55, data), contact(66, data)] }).code, 'ambiguous_identity');
  for (const reply of [{ error: 'network' }, { statusCode: 500, body: {} }, { statusCode: 200, body: {} },
    { body: { total: 0, contacts: {} } }, { statusCode: 200, body: { total: 1, contacts: {} } }]) {
    const plan = resolve(data, { realworks_code: reply });
    assert.equal(plan.code, 'lookup_failed');
    assert.equal(plan.method, undefined);
  }
});

test('succes vereist opslag én teruglezen van hetzelfde contact met juiste identifiers', () => {
  const plan = resolve(mapped());
  const saved = { statusCode: 201, body: { contact: contact(55, plan.fields) } };
  const written = matching.checkWrite(saved, plan);
  const verified = matching.verifyContact({ ...saved, statusCode: 200 }, written);
  assert.equal(verified.mauticContactId, 55);
  assert.equal(verified.needsWriteBack, true);
  assert.equal(shared.confirmedResponse(verified), true);
  assert.equal(shared.confirmedResponse({ status: 'ok' }), false);
  assert.equal(matching.verifyContact({ statusCode: 200, body: { contact: contact(56, plan.fields) } }, written).status, 'error');
  assert.equal(matching.checkWrite({ error: 'timeout' }, plan).status, 'error');
});

test('terugschrijven wordt overgeslagen zodra field1 al klopt', () => {
  const data = mapped({ _mauticContactId: '55' });
  const existing = contact(55, data);
  const plan = resolve(data, { realworks_code: [existing], systemid: [existing], field1: [existing] });
  const result = { statusCode: 200, body: { contact: existing } };
  assert.equal(matching.verifyContact(result, matching.checkWrite(result, plan)).needsWriteBack, false);
});

test('gepubliceerde contacttak bevat actuele bibliotheken en behoudt de tussenvoegselmapping', () => {
  const branch = JSON.parse(read('n8n/Realworks Contact Sync.branch.json')) as {
    nodes: { name: string; parameters: { jsCode?: string; [key: string]: unknown }; [key: string]: unknown }[];
    connections: Record<string, { main: { node: string }[][] }>;
  };
  const code = (name: string) => branch.nodes.find((n) => n.name === name)!.parameters.jsCode!;
  assert.ok(code('Valideer relatie').startsWith(sharedCode));
  assert.ok(code('Beslis contactkoppeling').startsWith(matchingCode));
  for (const [middle, last, expected] of [['van', 'Os', 'van Os'], ['van', 'van Os', 'van Os'], ['', 'Os', 'Os']]) {
    const output = vm.runInNewContext(`(function(){${code('Code in JavaScript')}})()`, {
      $input: { first: () => ({ json: { body: { firstname: 'Jan', middlename: middle, lastname: last, systemid: '123' } } }) },
    });
    assert.equal(output[0].json.lastname, expected);
    assert.equal(output[0].json.systemid, '123');
  }
  const names = new Set(branch.nodes.map((n) => n.name));
  for (const connection of Object.values(branch.connections)) {
    for (const output of connection.main) for (const edge of output) assert.ok(names.has(edge.node));
  }
  assert.equal(branch.nodes.filter((n) => n.name.includes('Mautic') && n.type === 'n8n-nodes-base.httpRequest').length, 3);
});

function extensionHarness(webhook: () => Promise<Response>) {
  const storage: Record<string, unknown> = { webhookSecret: 'test-only-secret' };
  let count = 0;
  const context = vm.createContext({
    TextEncoder, crypto: webcrypto, console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0, clearInterval() {},
    chrome: { runtime: { id: 'test-extension', getManifest: () => ({ version: '1.13' }), sendMessage: async () => ({}) },
      storage: { local: { get: async (key: string) => ({ [key]: storage[key] }), set: async (value: object) => Object.assign(storage, value) } } },
    window: { location: { href: 'https://crm.realworks.nl/relatie' }, addEventListener() {} },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    fetch: async (url: string) => {
      if (url.endsWith('/webhook/realworks-sync')) { count++; return webhook(); }
      return Response.json({ success: true });
    },
  });
  vm.runInContext(sharedCode + '\n' + read('browserext/content.js'), context);
  const sync = context.handleContactSync as (data: Fields, path: string) => Promise<void>;
  return { sync: (data = { _systemid: '123', firstname: 'Sync' }) => sync(data, '/rela.person/save'),
    count: () => count, storage };
}

test('echte extensiecode onderdrukt dubbele saves, ook tijdens de eerste request', async () => {
  const harness = extensionHarness(async () => Response.json({ status: 'ok', mauticContactId: 55, matchStrategy: 'systemid' }));
  await Promise.all([harness.sync(), harness.sync()]);
  await harness.sync();
  assert.equal(harness.count(), 1);
});

test('echte extensiecode kan na mislukking dezelfde payload opnieuw versturen', async () => {
  let attempt = 0;
  const harness = extensionHarness(async () => ++attempt === 1 ? Response.json({ reason: 'Uitval' }, { status: 502 })
    : Response.json({ status: 'ok', mauticContactId: 55, matchStrategy: 'systemid' }));
  await harness.sync();
  await harness.sync();
  assert.equal(harness.count(), 2);
  assert.equal((harness.storage.realworksSyncStatus as { sent: number }).sent, 1);
});

test('HTTP 200 zonder contactbevestiging wordt geen succes en blokkeert geen nieuwe poging', async () => {
  const harness = extensionHarness(async () => Response.json({ status: 'ok' }));
  await harness.sync();
  await harness.sync();
  assert.equal(harness.count(), 2);
  assert.equal((harness.storage.realworksSyncStatus as { sent: number }).sent, 0);
});
