// n8n Code node: Realworks → Mautic veld mapping
// Input: webhook body van de browser extensie

const d = $input.first().json.body ?? $input.first().json;

// ISO landcodes → Mautic verwacht volledige naam
const LANDEN = {
  NL: 'Netherlands', BE: 'Belgium', DE: 'Germany', FR: 'France',
  GB: 'United Kingdom', US: 'United States', TR: 'Turkey', MA: 'Morocco',
  PL: 'Poland', RO: 'Romania', BG: 'Bulgaria', HU: 'Hungary',
};

// typerela → contact_type booleans
const typerela = (d.typerela || '').toLowerCase();
const isVerkoper  = /verkoper|verkoop/.test(typerela);
const isKoper     = /koper|aankoper/.test(typerela);
const isZoeker    = /zoeker/.test(typerela);

// Adresregel samenvoegen
const address1 = [d.hstreet, d.hhouseno, d.hhousenoext]
  .filter(Boolean).join(' ').trim();

// Alleen velden meesturen die een waarde hebben (geen null/lege strings)
function defined(val) {
  return val !== undefined && val !== null && val !== '';
}

const mautic = {};

if (defined(d.firstname || d.christianname)) mautic.firstname  = d.firstname || d.christianname;
if (defined(d.lastname))    mautic.lastname   = d.lastname;
if (defined(d.email))       mautic.email      = d.email;
if (defined(d.mobile))      mautic.mobile     = d.mobile;

// tel: voorkeur tel2, anders tel1
const phone = d.tel2 || d.tel1;
if (defined(phone))         mautic.phone      = phone;

if (defined(address1))      mautic.address1   = address1;
if (defined(d.hzipcode))    mautic.zipcode    = d.hzipcode;
if (defined(d.hcity))       mautic.city       = d.hcity;
if (defined(d.hcountry))    mautic.country    = LANDEN[d.hcountry] || d.hcountry;

if (defined(d._systemid))   mautic.systemid   = parseInt(d._systemid);
if (defined(d.rcode))       mautic.realworks_code = parseInt(d.rcode);
if (defined(d.hhouseno))    mautic.huisnummer = parseInt(d.hhouseno);
if (defined(d.hhousenoext)) mautic.huisnummer_toevoeging = d.hhousenoext;

// Contact type booleans — alleen zetten als typerela ingevuld is
if (defined(d.typerela)) {
  mautic.contact_type_verkoper   = isVerkoper;
  mautic.contact_type_koper      = isKoper;
  mautic.contact_type_zoeker     = isZoeker;
}

return [{
  json: {
    // Zoeksleutels voor volgende Mautic-node
    search_email:    d.email    || null,
    search_systemid: d._systemid || null,

    // Payload voor Mautic contact update
    mautic,

    // Raw voor debugging
    _source: d.source,
    _page:   d.page_url,
  }
}];
