import test from "node:test";
import assert from "node:assert/strict";
import { parseRealworksMutationEmailHtml } from "./realworksMutations";

const encoded =
  "RXhjaGFuZ2VPYmplY3Q6NjgxMjY3MnwzMDJhODZhYWQzY2E5MzBmNmU0NGM4MTA0NTkwYTI3OTM4ODQwM2M5MTlmNWQ2MzQ3YTE1MDZiYWE2MjI3NzFkMGFlZTI2MjJkMDA4NzRlZjdlZDJmZWZmZjVhNDYxN2UwZjllZmE5ZTU1ODQ5NThhODU0YzRlODlkOTE5YTdmN3w0Mzc0Ng";

test("parseert Realworks mutatiemail objectregels", () => {
  const html = `
    <table><tr><td>Nieuwe Objecten</td></tr></table>
    <div style="page-break-inside:avoid">
      <table><tr>
        <td><b>Aangemeld per 19-06-2026</b></td>
        <td></td>
        <td><b>Woonhuis</b> (Eengezinswoning)</td>
      </tr></table>
      <table><tr>
        <td><img src="https://example.test/foto.jpg" /></td>
        <td>
          <a href="https://move.nl/exchange-object/${encoded}/overzicht">
            <b>Rozenburg, De Plataan 11 , 3181 AB</b>
          </a>
          <div style="font-size:10px;">Xtra makelaardij - Telefoon 0181-323793 - E-mail <a href="mailto:info@example.test">info@example.test</a></div>
          <br /><b>Vraagprijs &#8364; 429.500,00 kosten koper</b>
        </td>
        <td>
          5 kamer(s) waarvan 4 slaapkamer(s)<br />
          131 m&sup2; gebruiksopp. woonfunctie<br />
          127 m&sup2; perceel oppervlak<br />
          Bouwjaar 2008
        </td>
      </tr></table>
    </div>
  `;

  const [mutation] = parseRealworksMutationEmailHtml(html);
  assert.equal(mutation.exchangeObjectId, "6812672");
  assert.equal(mutation.mutationType, "new");
  assert.equal(mutation.addressRaw, "Rozenburg, De Plataan 11 , 3181 AB");
  assert.equal(mutation.askingPrice, 429500);
  assert.equal(mutation.livingArea, 131);
  assert.equal(mutation.bedrooms, 4);
});
