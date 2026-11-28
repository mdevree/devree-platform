import assert from "node:assert/strict";
import test from "node:test";
import { mentionsAddress, normal } from "./whatsappRecommendationContext";
import { officePage, sentPageHashes } from "./whatsappResourceLinks";
import { generateWhatsAppReplySuggestion } from "./whatsappReplyGenerator";

test("herkent een bekend adres in een oude link en respecteert verschillende huisnummers", () => {
  const source = " "+normal("https://www.devreemakelaardij.nl/aanbod/spijkenisse-a-m-de-jongstraat-34/ en Parelgras 130")+" ";
  assert.equal(mentionsAddress(source,"Parelgras 13"),false);
  assert.ok(mentionsAddress(source,"A.M. de Jongstraat 34"));
  assert.ok(mentionsAddress(" "+normal("bezichtiging A.M. de Jongstraat 34, Spijkenisse")+" ","A.M. de Jongstraat 34"));
});

test("slechts een vingerafdruk per verzonden eigen pagina, ongeacht tracking", () => {
  const u = "https://www.devreemakelaardij.nl/aanbod/test-1/";
  assert.deepEqual(sentPageHashes(u+"?rcode=12 "+u+" https://example.com/a"), sentPageHashes(u));
  assert.equal(sentPageHashes(u).length,1);
  assert.equal(officePage("https://www.devreemakelaardij.nl.example.com/a"),null);
});

test("de generator mag uitsluitend letterlijk aangeleverde links gebruiken", async () => {
  const g = {kind:"openai" as const,key:"test",model:"test",account:"office" as const};
  const url = "https://www.devreemakelaardij.nl/vragen/bieden/";
  const fake = async () => Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({body:url,summary:"Stelt een vraag over een woning"})}]}]});
  const c = {inbound:["Hoe werkt bieden?"],resources:{homes:[],pages:[{url,title:"Hoe werkt bieden?"}]}};
  assert.equal((await generateWhatsAppReplySuggestion(g,c,fake)).body,url);
  await assert.rejects(generateWhatsAppReplySuggestion(g,{...c,resources:{homes:[],pages:[]}},fake),/niet-geverifieerde link/);
});

test("zoekt pas extern als eigen aanbod niet past, en geeft de historie nooit aan de generator", async () => {
  const g = {kind:"openai" as const,key:"test",model:"test",account:"office" as const};
  const marketSearch = { cities:["Spijkenisse"],maxPrice:310000,minPrice:null,bedrooms:2,kind:"Appartement",keywords:["lift"] };
  const other = {title:"Teststraat 23",price:300000,city:"Spijkenisse",description:"lift",url:"",broker:"Testmakelaar"};
  const own = {...other, title:"Eigenstraat 7",price:420000};
  let lookups=0;
  const resources={pages:[],homes:[own],findMarket:async (query:unknown)=>{lookups++;assert.deepEqual(query,marketSearch);return [other]}};
  function completion(fields: Record<string,unknown>) {
    return Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(fields)}]}]});
  }
  let calls=0;
  const result=await generateWhatsAppReplySuggestion(g,{inbound:["Appartement met lift tot €310.000 in Spijkenisse?"],resources},async (_url,opts)=>{
    calls++;
    const payload=JSON.parse(String(opts?.body));
    const offered=JSON.parse(payload.input).kantoorbronnen.homes;
    if(calls===1){assert.deepEqual(offered,[own]);return completion({body:"",summary:"",marketSearch});}
    assert.deepEqual(offered,[other]);
    assert.ok(!payload.text.format.schema.properties.marketSearch);
    return completion({body:"Teststraat 23 staat bij Testmakelaar te koop.",summary:"Stelt een vraag over een woning"});
  });
  assert.match(result.body,/Teststraat 23/);assert.equal(lookups,1);
  await generateWhatsAppReplySuggestion(g,{inbound:["Eigenstraat lijkt me mooi"],resources},async()=>completion({body:"Eigenstraat 7 heeft een lift.",summary:"Stelt een vraag over een woning",marketSearch:null}));
  assert.equal(lookups,1);
});
