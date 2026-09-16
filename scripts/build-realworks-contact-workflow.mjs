import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const validation = read('browserext/contact-sync.js');
const matching = read('n8n/lib/realworks-contact-matching.js');
const allowed = JSON.parse(read('n8n/lib/realworks-contact-fields.json'));
export const replacedNames = ['Heeft e-mail?', 'Search in Mautic1', 'Check if Exists1',
  'Contact Exists?1', 'Create Mautic Contact1', 'Update Mautic Contact', 'Switch2',
  'Update Mautic Contact1', 'Contact Verwerkt1'];

export function buildContactBranch(before) {
  if (!before.versionId) throw new Error('The sanitized export must include its source versionId.');
  const old = (name) => structuredClone(before.nodes.find((n) => n.name === name));
  const credentials = old('Create Mautic Contact1').credentials;
  let number = 0;
  const node = (name, type, parameters, extra = {}) => ({
    id: `realworks-contact-v2-${++number}`, name, type: `n8n-nodes-base.${type}`,
    typeVersion: type === 'code' ? 2 : type === 'httpRequest' ? 4.2 : type === 'if' ? 2.2 : 1.4,
    position: [number * 200, 944], parameters, ...extra,
  });
  const code = (name, source) => node(name, 'code', { jsCode: source });
  const condition = (name, expression) => node(name, 'if', {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: `${name}-condition`, leftValue: expression, rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  });
  const http = (name, write = false) => node(name, 'httpRequest', {
    authentication: 'predefinedCredentialType', nodeCredentialType: 'mauticOAuth2Api',
    method: write ? '={{ $json.method }}' : 'GET', url: '={{ $json.url }}',
    ...(write ? { sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fields) }}' } : {}),
    options: { timeout: 20000, response: { response: { responseFormat: 'json', fullResponse: true, neverError: true } } },
  }, { credentials, onError: 'continueRegularOutput' });
  const map = old('Code in JavaScript');
  map.parameters.jsCode = read('n8n/lib/realworks-contact-map.js') + '\nreturn globalThis.mapRealworksContact($input.first().json.body || {});';
  const queue = old('Schrijf naar Realworks Queue');
  queue.onError = 'continueRegularOutput';
  const respond = old('Respond1');
  respond.parameters = { respondWith: 'json', responseBody: '={{ JSON.stringify($("Bevestig opgeslagen contact").first().json) }}', options: {} };
  const nodes = [old('Webhook1'),
    code('Valideer relatie', validation + `\nconst item = $input.first().json;
const body = item.body || {};
const reasons = globalThis.RealworksContactSync.contactReasons(body, body._sync?.realworksPath ?? '/rela.person/save');
if (body._sync?.eventType && body._sync.eventType !== 'contact.save') reasons.push('Onjuist contact-event.');
if (body.source !== 'realworks') reasons.push('Onbekende bron voor contact-sync.');
return [{json: reasons.length ? {status:'error',statusCode:422,code:'invalid_contact',reason:reasons.join('; ')} : {...item,status:'valid'}}];`),
    condition('Relatie geldig?', "={{ $json.status === 'valid' }}"), map,
    code('Bereid contactzoekvragen voor', matching + `\nreturn globalThis.RealworksContactMatching.lookupRequests($input.first().json).map(json => ({json}));`),
    http('Zoek exacte Mautic-identiteit'),
    code('Beslis contactkoppeling', matching + `\nreturn [{json: globalThis.RealworksContactMatching.resolveContact($('Code in JavaScript').first().json, $input.all().map(i=>i.json), ${JSON.stringify(allowed)})}];`),
    condition('Contact veilig te bewaren?', "={{ $json.status === 'ready' }}"),
    http('Bewaar Mautic-contact', true),
    code('Controleer opslagantwoord', matching + `\nreturn [{json: globalThis.RealworksContactMatching.checkWrite($input.first().json, $('Beslis contactkoppeling').first().json)}];`),
    condition('Contact opgeslagen?', "={{ $json.status === 'written' }}"),
    http('Lees opgeslagen Mautic-contact'),
    code('Bevestig opgeslagen contact', matching + `\nreturn [{json: globalThis.RealworksContactMatching.verifyContact($input.first().json, $('Controleer opslagantwoord').first().json)}];`),
    condition('Contact bevestigd?', "={{ $json.status === 'ok' }}"),
    { ...condition('Heeft systemid?', '={{ $json.needsWriteBack === true }}'), id: old('Heeft systemid?').id },
    queue,
    code('Controleer terugschrijftaak', `const result=$input.first().json;
return [{json: result.success === true && result.task?.id ? {status:'queued'} : {status:'error',statusCode:502,code:'writeback_failed',reason:'Het contact is opgeslagen, maar het terugschrijven naar Realworks is niet bevestigd. Opnieuw opslaan probeert dit opnieuw.'}}];`),
    condition('Terugschrijftaak bevestigd?', "={{ $json.status === 'queued' }}"), respond,
    node('Respond Contactfout', 'respondToWebhook', { respondWith: 'json',
      responseBody: '={{ JSON.stringify({status:"error", code:$json.code, reason:$json.reason}) }}',
      options: { responseCode: '={{ $json.statusCode || 502 }}' } }),
  ];
  const connections = {};
  const connect = (from, yes, no) => { connections[from] = { main: [yes, ...(no ? [no] : [])].map((name) => [{ node: name, type: 'main', index: 0 }]) }; };
  connect('Webhook1', 'Valideer relatie');
  connect('Valideer relatie', 'Relatie geldig?');
  connect('Relatie geldig?', 'Code in JavaScript', 'Respond Contactfout');
  connect('Code in JavaScript', 'Bereid contactzoekvragen voor');
  connect('Bereid contactzoekvragen voor', 'Zoek exacte Mautic-identiteit');
  connect('Zoek exacte Mautic-identiteit', 'Beslis contactkoppeling');
  connect('Beslis contactkoppeling', 'Contact veilig te bewaren?');
  connect('Contact veilig te bewaren?', 'Bewaar Mautic-contact', 'Respond Contactfout');
  connect('Bewaar Mautic-contact', 'Controleer opslagantwoord');
  connect('Controleer opslagantwoord', 'Contact opgeslagen?');
  connect('Contact opgeslagen?', 'Lees opgeslagen Mautic-contact', 'Respond Contactfout');
  connect('Lees opgeslagen Mautic-contact', 'Bevestig opgeslagen contact');
  connect('Bevestig opgeslagen contact', 'Contact bevestigd?');
  connect('Contact bevestigd?', 'Heeft systemid?', 'Respond Contactfout');
  connect('Heeft systemid?', 'Schrijf naar Realworks Queue', 'Respond1');
  connect('Schrijf naar Realworks Queue', 'Controleer terugschrijftaak');
  connect('Controleer terugschrijftaak', 'Terugschrijftaak bevestigd?');
  connect('Terugschrijftaak bevestigd?', 'Respond1', 'Respond Contactfout');
  return { name: 'Realworks platform Sync - contact branch', workflowId: 'BXamv0Exk1GFQRE6',
    baseVersionId: before.versionId, replacedNames, nodes, connections };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/build-realworks-contact-workflow.mjs SANITIZED_CONTACT_EXPORT');
  const branch = buildContactBranch(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(path.join(root, 'n8n/Realworks Contact Sync.branch.json'), JSON.stringify(branch, null, 2) + '\n');
  console.log(`Generated contact branch: ${branch.nodes.length} nodes; server-only headers stay redacted.`);
}
