import test from 'node:test';
import assert from 'node:assert/strict';
import {counted,matchProjects,publicationKey,parseRow,url,findExternalMatch,reviewBucket} from './rules';
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
 assert.deepEqual(matchProjects({content:'Ring 22'},[...p,{...p[0],id:'3'}]),['1','3']);
 assert.deepEqual(matchProjects({content:'Ring 22'},[...p,{...p[0],id:'3',realworksId:'SE3'}]),[]);
 assert.deepEqual(matchProjects({content:'Ring 22 en Ring 220'},p),[]);
});

test('address suffix spacing and duplicate projects for the same Realworks object',()=>{
 const p=[{id:'1',realworksId:'SE11891',woningAdres:'Frans Halsstraat 19A',address:null},{id:'2',realworksId:'SE11891',woningAdres:'Frans Halsstraat 19A',address:null}];
 assert.deepEqual(matchProjects({content:'Frans Halsstraat 19 A · Spijkenisse'},p),['1','2']);
 assert.deepEqual(matchProjects({content:'Zonder adres',realworksId:'SE11891'},p),['1','2']);
 assert.deepEqual(matchProjects({content:'Frans Halsstraat 19B'},p),[]);
 assert.deepEqual(matchProjects({content:'Frans Halsstraat 19'},p),[]);
});
test('review worklist separates general content, unknowns and inactive records without losing history',()=>{
 const p={scope:'property',everPublished:false,state:'QUEUE',sourceRemoved:false,excluded:false};
 assert.equal(reviewBucket(p),'property');
 assert.equal(reviewBucket({...p,scope:'general'}),'general');
 assert.equal(reviewBucket({...p,scope:'unknown'}),'unknown');
 for(const state of ['DRAFT','ERROR'])assert.equal(reviewBucket({...p,state}),'archive');
 assert.equal(reviewBucket({...p,sourceRemoved:true}),'archive');
 assert.equal(reviewBucket({...p,sourceRemoved:true,everPublished:true}),'property');
 assert.equal(reviewBucket({...p,excluded:true}),'excluded');
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

test('Google account URL does not merge separate publications; exact key takes precedence',()=>{
 const shared='https://business.google.com/locations/123';
 const items=[{id:'a',externalKey:'key-a',releaseUrl:shared,source:'postiz'},{id:'b',externalKey:'key-b',releaseUrl:shared,source:'postiz'}];
 assert.equal(findExternalMatch(items,'key-b',shared)?.id,'b');
 assert.equal(findExternalMatch(items,'key-c',shared),undefined);
 assert.equal(findExternalMatch([{...items[0],source:'manual'}],'key-c',shared),undefined);
 assert.equal(findExternalMatch([{...items[0],source:'manual',releaseUrl:'https://facebook.com/posts/123'}],'new','https://facebook.com/posts/123')?.id,'a');
});
test('TikTok inbox delivery is not public publication evidence',()=>{
 const p=parseRow({sourceId:'p',accountId:'a',channel:'tiktok',kind:'video',state:'PUBLISHED',account:'De Vree',content:'Woning',releaseId:'missing',releaseUrl:'https://www.tiktok.com/messages?lang=en'});
 assert.equal(p.releaseId,null);assert.equal(p.releaseUrl,null);
});
