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
