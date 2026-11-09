import test from 'node:test';
import assert from 'node:assert/strict';
import {claimSweep,ownsSweep,SWEEP_LEASE,SWEEP_INTERVAL} from './searcherSweepLease';
test('only one browser owns the office round, and renewal retains its token',()=>{
 const a=claimSweep({},'A',100,'token-A')!;
 assert.equal(claimSweep(a,'B',101,'token-B'),null);
 assert.equal(claimSweep(a,'A',102,'unused')!.token,'token-A');
 assert.equal(ownsSweep(a,'B','token-A',101),false);
});
test('takeover preserves checkpoint and fences the expired owner',()=>{
 const state={ids:['1','2'],index:1,phase:'results',page:3,startedAt:'today'};
 const a=claimSweep({state},'A',100,'token-A')!;
 const b=claimSweep(a,'B',101+SWEEP_LEASE,'token-B')!;
 assert.deepEqual(b.state,state);
 assert.equal(ownsSweep(b,'A','token-A',102+SWEEP_LEASE),false);
 assert.equal(ownsSweep(a,'A','token-A',100+SWEEP_LEASE),false);
});
test('six hour cooldown applies equally to every browser',()=>{
 const completed={nextRunAt:100+SWEEP_INTERVAL,state:null};
 for(const owner of ['A','B'])assert.equal(claimSweep(completed,owner,101,'new'),null);
 assert.ok(claimSweep(completed,'B',100+SWEEP_INTERVAL,'new'));
});
