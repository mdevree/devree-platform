import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearcher, normalizeResult } from './realworksSearcherNormalization';
import { mergeSearcher } from './realworksSearcherSync';
test('Realworks string email and phone object link to the correct identity',()=>{
 const s=normalizeSearcher({id:5758031,clients:[{id:67787819,emailAddresses:['zoeker@example.test'],phoneNumbers:{mobile:'0612345678'},moveAccountDetails:{relationSystemId:67787819}}],price:{min:400000,max:450000}});
 assert.equal(s.clientEmail,'zoeker@example.test');assert.equal(s.clientPhone,'0612345678');assert.equal(s.relationSystemId,'67787819');assert.equal(s.priceMax,450000);
});
test('partial list updates retain detailed criteria and client identity',()=>{
 const previous={id:1,clients:[{id:2,name:'Zoeker',emailAddresses:['zoeker@example.test']}],outdoorAmenities:['GARDEN'],price:{min:400000,max:450000}};
 const s=normalizeSearcher(mergeSearcher(previous,{node:{id:1,status:'GEREED',clients:[{id:2,name:'Zoeker'}]}}));
 assert.equal(s.status,'GEREED');assert.equal(s.clientEmail,'zoeker@example.test');assert.equal(s.priceMax,450000);
 assert.deepEqual(s.raw.outdoorAmenities,['GARDEN']);
});
test('viewed, liked and contact-request signals remain distinct',()=>{
 const r=normalizeResult({searcherId:1,exchangeObjectId:2,dateViewed:'2026-11-09T12:00:00Z',isLiked:false,dateContactFormClicked:null,exchangeObject:{address:{streetName:'Teststraat',houseNumber:'5'},price:{sellingPrice:425000}}});
 assert.equal(r.isLiked,false);assert.equal(r.dateContactFormClicked,null);assert.equal(r.dateViewed?.toISOString(),'2026-11-09T12:00:00.000Z');assert.equal(r.objectAddress,'Teststraat 5');assert.equal(r.objectPrice,425000);
});
