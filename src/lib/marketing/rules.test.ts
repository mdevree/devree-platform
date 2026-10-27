import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDaily, compareSnapshot, difference, normalizeMetrics, parseIngest, shiftDate, SPECS, type Snapshot } from './rules';

const now = new Date('2026-10-27T10:00:00Z');
function daily(provider: string, label: string, count = 65): Snapshot {
  return { channelId: 'channel', provider, windowDays: 65, capturedAt: now,
    metrics: [{ label, percentageChange: 5, data: Array.from({ length: count }, (_,i) => ({ date: shiftDate('2026-08-24',i), total: i >= 50 ? 20 : 10 })) }] };
}

test('Facebook end-time labels become source days; partial today is excluded', () => {
  const snapshot = daily('facebook','Media views');
  const r = compareDaily(snapshot,SPECS.facebook,7,now);
  assert.equal(r.end,'2026-10-26'); assert.equal(r.start,'2026-10-20');
  assert.equal(r.previousEnd,'2026-10-19'); assert.equal(r.previousStart,'2026-10-13');
  assert.equal(r.value,140); assert.equal(r.previous,140); assert.equal(r.percent,0);
});
test('30 day comparison crosses DST as calendar days, not fixed local offsets', () => {
  const r = compareDaily(daily('facebook','Media views'),SPECS.facebook,30,now);
  assert.equal(r.start,'2026-09-27'); assert.equal(r.previousEnd,'2026-09-26');
  assert.equal(r.points.length,30); assert.equal(r.previousStart,'2026-08-28');
});
test('Google provisional recent zeros do not dilute the comparison', () => {
  const r = compareDaily(daily('gmb','Website Clicks'),SPECS.gmb,7,now);
  assert.equal(r.end,'2026-10-24');
});
test('missing previous or current points remain unknown, not zero-filled', () => {
  const s = daily('pinterest','Impressions');
  const m = normalizeMetrics(s.metrics);m[0].data=m[0].data.filter(p => p.date !== '2026-10-18');s.metrics=m;
  const r = compareDaily(s,SPECS.pinterest,7,now);
  assert.equal(r.value,140); assert.equal(r.previous,null); assert.equal(r.percent,null);
  m[0].data=m[0].data.filter(p => p.date !== '2026-10-24');
  assert.equal(compareDaily(s,SPECS.pinterest,7,now).value,null);
});
test('zero baseline has absolute change, never infinite growth', () => {
  assert.deepEqual(difference(5,0),{delta:5,percent:null});
  assert.deepEqual(difference(0,0),{delta:0,percent:0});
  assert.deepEqual(difference(0,5),{delta:-5,percent:-100});
});
test('latest available day is used for a delayed provider', () => {
  const s = daily('pinterest','Impressions',63);
  assert.equal(compareDaily(s,SPECS.pinterest,7,now).end,'2026-10-25');
});
test('snapshot growth requires the same channel, window and comparable recorded time', () => {
  const current: Snapshot = { channelId:'a',provider:'instagram',windowDays:7,capturedAt:now,metrics:[{label:'Views',data:[{date:'2026-10-27',total:120}]}] };
  const previous = {...current,capturedAt:new Date('2026-10-20T10:00:00Z'),metrics:[{label:'Views',data:[{date:'2026-10-20',total:100}]}]};
  assert.equal(compareSnapshot(current,previous,SPECS.instagram,7).percent,20);
  assert.equal(compareSnapshot(current,{...previous,channelId:'b'},SPECS.instagram,7).percent,null);
  assert.equal(compareSnapshot(current,{...previous,windowDays:30},SPECS.instagram,7).percent,null);
  assert.equal(compareSnapshot(current,{...previous,capturedAt:new Date('2026-10-19T10:00:00Z')},SPECS.instagram,7).percent,null);
  assert.equal(compareSnapshot(current,null,SPECS.instagram,7).value,120);
});
test('null, blank, infinite, negative and duplicate source values are rejected', () => {
  for (const total of [null,'',false,Infinity,-1,'NaN']) assert.throws(() => normalizeMetrics([{label:'Views',data:[{date:'2026-10-27',total}]}]));
  assert.throws(() => normalizeMetrics([{label:'Views',data:[{date:'2026-02-30',total:1}]}]));
  assert.throws(() => normalizeMetrics([{label:'Views',data:[{date:'2026-10-27',total:1},{date:'2026-10-27',total:2}]}]));
  assert.deepEqual(normalizeMetrics([{label:'Views',percentageChange:5,secret:'discard',data:[{date:'2026-10-27',total:'0'}]}]),[{label:'Views',data:[{date:'2026-10-27',total:0}]}]);
});
test('empty provider arrays do not invent zero measurements', () => {
  assert.equal(compareDaily({...daily('linkedin-page','Page Views'),metrics:[{label:'Page Views',data:[]}]},SPECS['linkedin-page'],7,now).value,null);
});
test('ingest strips arbitrary metadata and rejects duplicate snapshots and unowned channels', () => {
  const payload={capturedAt:now.toISOString(),channels:[{id:'a',name:'De Vree',provider:'facebook',status:'ok',token:'not persisted'}],snapshots:[{channelId:'a',windowDays:65,metrics:[{label:'Media views',data:[{date:'2026-10-26',total:1}]}]}]};
  const parsed=parseIngest(payload,now);assert.equal('token' in parsed.channels[0],false);
  assert.throws(() => parseIngest({...payload,snapshots:[...payload.snapshots,...payload.snapshots]},now));
  assert.throws(() => parseIngest({...payload,snapshots:[{...payload.snapshots[0],channelId:'other'}]},now));
});
