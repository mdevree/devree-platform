// n8n Code node: Realworks → Mautic veld mapping
// Input: webhook body van de browser extensie
// Output: flat object — velden direct bruikbaar door downstream Mautic nodes

const d = $input.first().json.body ?? $input.first().json;

const LANDEN = {
  NL: 'Netherlands', BE: 'Belgium', DE: 'Germany', FR: 'France',
  GB: 'United Kingdom', US: 'United States', TR: 'Turkey', MA: 'Morocco',
  PL: 'Poland', RO: 'Romania', BG: 'Bulgaria', HU: 'Hungary',
};

const typerela = (d.typerela || '').toLowerCase();

return [{
  json: {
    // Zoeksleutels
    search_email:    d.email    || null,
    search_systemid: d._systemid || null,

    // Persoonsgegevens
    firstname: d.firstname || d.christianname || null,
    lastname:  d.lastname  || null,
    email:     d.email     || null,
    mobile:    d.mobile    || null,
    phone:     d.tel2 || d.tel1 || null,

    // Adres (als 'address' want zo verwijzen de Mautic-nodes ernaar)
    address:  [d.hstreet, d.hhouseno, d.hhousenoext].filter(Boolean).join(' ').trim() || null,
    zipcode:  d.hzipcode  || null,
    city:     d.hcity     || null,
    country:  d.hcountry ? (LANDEN[d.hcountry] || d.hcountry) : null,

    // Huisnummer apart voor custom veld
    huisnummer:            d.hhouseno    ? parseInt(d.hhouseno)    : null,
    huisnummer_toevoeging: d.hhousenoext || null,

    // Realworks IDs
    systemid:       d._systemid ? parseInt(d._systemid) : null,
    realworks_code: d.rcode     ? parseInt(d.rcode)     : null,

    // Contact type booleans (alleen als typerela gevuld is)
    contact_type_verkoper:  d.typerela ? /verkoper|verkoop/.test(typerela) : null,
    contact_type_koper:     d.typerela ? /koper|aankoper/.test(typerela)  : null,
    contact_type_zoeker:    d.typerela ? /zoeker/.test(typerela)          : null,
    contact_type_bezichtiger: null, // wordt elders gezet

    // Velden die niet uit Realworks komen (worden niet overschreven)
    laatste_transactie_jaar: null,
    transactie_jaren:        null,
    segment_prioriteit:      null,
    campagne_oudklanten:     null,
    intentie_verkoop:        null,
  }
}];
