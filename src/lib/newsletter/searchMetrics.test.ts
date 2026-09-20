import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,noResultKeywords} from './searchMetrics';

test('aantal acties blijft onderscheiden van bezoeken en van nulresultaten',()=>{
 const searches=aggregate([{label:'bedenktijd',nb_hits:2,nb_visits:1}]);
 const zero=noResultKeywords([{label:'FAQ zonder resultaat',nb_events:1,subtable:[{label:'bedenktijd',nb_events:1}]},{label:'Ander event',subtable:[{label:'bedenktijd',nb_events:20}]}]);
 assert.equal(searches.get('bedenktijd'),2);assert.equal(zero.get('bedenktijd'),1);
});
test('geen events is leeg; ontbrekende subtable is een fout, geen nulmeting',()=>{
 assert.equal(noResultKeywords([]).size,0);
 assert.throws(()=>noResultKeywords([{label:'FAQ zonder resultaat',nb_events:2}]));
 assert.equal(noResultKeywords([{label:'FAQ zonder resultaat',subtable:[{label:'qa@example.invalid',nb_events:1}]}]).size,0);
});
