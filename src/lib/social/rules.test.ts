import test from 'node:test';
import assert from 'node:assert/strict';
import {counted,matchProjects,publicationKey,parseRow,url} from './rules';
test('publication count excludes queued/unconfirmed, retains expired and removed history',()=>{
 assert.equal(counted({everPublished:false,excluded:false}),false);
 assert.equal(counted({everPublished:true,excluded:false}),true);
 assert.equal(counted({everPublished:true,excluded:true}),false);
});
test('matching object code wins, duplicate projects and partial addresses never guessed',()=>{
 const p=[{id:'1',realworksId:'SE1',woningAdres:'Ring 22',address:null},{id:'2',realworksId:'SE2',woningAdres:'Ring 220',address:null}];
 assert.deepEqual(matchProjects({content:'Bekijk Ring 22.',realworksId:null},p),['1']);
 assert.deepEqual(matchProjects({content:'Ring 220'},p),['2']);
 assert.deepEqual(matchProjects({content:'Ring 22',realworksId:'SE2'},p),['2']);
 assert.deepEqual(matchProjects({content:'Ring 22'},[...p,{...p[0],id:'3'}]),[]);
 assert.deepEqual(matchProjects({content:'Ring 22 en Ring 220'},p),[]);
});
test('external identity distinguishes channels but groups duplicate Postiz IDs',()=>{
 assert.equal(publicationKey('facebook','account','123','https://fb.com/a'),publicationKey('facebook','account','123',null));
 assert.notEqual(publicationKey('facebook','a','123',null),publicationKey('instagram','a','123',null));
});
test('import validation rejects unsupported states and unsafe links; preserves absent date',()=>{
 const row={sourceId:'1',accountId:'a',channel:'facebook',kind:'story',state:'PUBLISHED',account:'De Vree',content:'<p>Ring 22</p>'};
 assert.equal(parseRow(row).publishedAt,null);
 assert.equal(parseRow(row).content,'Ring 22');
 assert.throws(()=>parseRow({...row,state:'MADE_UP'}));
 assert.throws(()=>url('javascript:alert(1)'));
 assert.throws(()=>url('https://user:pass@example.com'));
 assert.equal(url('https://example.com/post?utm_source=test'),'https://example.com/post');
});
