import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,normalizeKeyword,sensitiveKeyword,reportPeriods,assertRemoteDraft,remoteHash} from './rules';
import {emailValue} from './signup';

test('veilige links weigeren uitvoerbare en ongeldige URL’s',()=>{
 assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('data:text/html,a'),null);assert.equal(safeUrl('/relative'),null);assert.equal(safeUrl('https://www.devreemakelaardij.nl/vragen/'),'https://www.devreemakelaardij.nl/vragen/');
});
test('zoektermen normaliseren en contactgegevens uitsluiten',()=>{
 assert.equal(normalizeKeyword('  VvÉ   Kosten '),'vve kosten');assert.ok(sensitiveKeyword('bel 06 1234 5678'));assert.ok(sensitiveKeyword('a@b.nl'));assert.ok(!sensitiveKeyword('taxatie 2026'));
});
test('rapportvensters bevatten volledige Nederlandse kalenderdagen, ook bij zomertijd',()=>{
 assert.deepEqual(reportPeriods(new Date('2026-10-25T23:30:00Z')),{current:'2026-09-26,2026-10-25',previous:'2026-08-27,2026-09-25'});
});
test('externe wijzigingen en reeds actieve mails blokkeren update',()=>{
 const remote={id:1,name:'qa',subject:'subject',customHtml:'body',isPublished:false,sentCount:0,lists:[33]};const hash=remoteHash(remote);
 assert.doesNotThrow(()=>assertRemoteDraft(remote,hash));assert.throws(()=>assertRemoteDraft({...remote,isPublished:true},hash));assert.throws(()=>assertRemoteDraft({...remote,sentCount:1},hash));assert.throws(()=>assertRemoteDraft({...remote,customHtml:'changed'},hash));
});
test('e-mailvalidatie normaliseert maar accepteert geen HTML of meerdere adressen',()=>{
 assert.equal(emailValue(' QA@example.invalid '),'qa@example.invalid');assert.throws(()=>emailValue('qa@example.invalid other@example.invalid'));assert.throws(()=>emailValue('<script>@example.invalid'));
});
