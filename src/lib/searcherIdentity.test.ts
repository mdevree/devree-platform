import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsSearcherEmailIdentity } from './searcherIdentity';
test('accepts the confirmed legacy relation code despite a different technical system ID',()=>{
 assert.equal(acceptsSearcherEmailIdentity('58709722','890919','890919','890919'),true);
 assert.equal(acceptsSearcherEmailIdentity('27790723','884343','884343',''),true);
});
test('does not connect a different household member sharing the email address',()=>{
 assert.equal(acceptsSearcherEmailIdentity('17624414','881098','881353','881353'),false);
});
test('rejects conflicting identity and relation code',()=>{
 assert.equal(acceptsSearcherEmailIdentity('64324334','891591','62585782','891591'),false);
 assert.equal(acceptsSearcherEmailIdentity('58709722','890919','890919','other'),false);
 assert.equal(acceptsSearcherEmailIdentity('58709722','890919','','other'),false);
});
