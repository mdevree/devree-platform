globalThis.mapRealworksContact = function (body) {

const pick = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text !== '' && text !== '0') return text;
  }
  return '';
};

// Realworks bewaart het tussenvoegsel apart; Mautic verwacht de volledige achternaam.
const fullLastName = (middleName, lastName) => {
  const prefix = pick(middleName).replace(/\s+/g, ' ');
  const surname = pick(lastName).replace(/\s+/g, ' ');
  if (!prefix || !surname) return surname;
  const lowerSurname = surname.toLocaleLowerCase('nl');
  const lowerPrefix = prefix.toLocaleLowerCase('nl');
  if (lowerSurname === lowerPrefix || lowerSurname.startsWith(lowerPrefix + ' ')) return surname;
  return prefix + ' ' + surname;
};

const labelFromMask = (value, mask) => {
  const selected = pick(value);
  if (!selected || !mask) return '';
  for (const part of String(mask).split('|')) {
    const [key, ...labelParts] = part.split(';');
    const label = labelParts.join(';').trim();
    if (String(key).trim() === selected && label) return label;
  }
  return '';
};

const countryMap = { NL: 'Netherlands', BE: 'Belgium', DE: 'Germany' };

const dateOnly = (...values) => {
  const value = pick(...values);
  if (!value) return '';
  const text = String(value).trim();
  let match = text.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (match) {
    const [, day, month, rawYear] = match;
    const year = rawYear.length === 2 ? '19' + rawYear : rawYear;
    return year.padStart(4, '0') + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
  }
  match = text.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
  }
  return text;
};

const agreementLabel = pick(
  body.otd_burgerlijke_staat,
  body.agreement_label,
  labelFromMask(body.agreement, body.agreement__MASK),
  body.burgerlijke_staat,
  body.marital_status,
  body.maritalstatus,
  body.burgstat
);

return [{
  json: {
    firstname:             pick(body.firstname),
    lastname:              fullLastName(body.middlename, body.lastname),
    email:                 pick(body.email),
    mobile:                pick(body.mobile),
    phone:                 pick(body.tel1, body.phone),
    address1:              [body.hstreet, body.hhouseno, body.hhousenoext].filter(Boolean).join(' ').trim(),
    address2:              [body.hzipcode, body.hcity].filter(Boolean).join(' ').trim(),
    zipcode:               pick(body.hzipcode),
    city:                  pick(body.hcity),
    country:               countryMap[body.hcountry] || pick(body.hcountry),
    salutation:            pick(body.saluation, body.salutation, body.title),
    typerela:              pick(body.rtype),
    systemid:              pick(body._systemid, body.systemid),
    realworks_code:        pick(body.rcode),
    huisnummer:            pick(body.hhouseno),
    huisnummer_toevoeging: pick(body.hhousenoext, body.hhousenoadd),
    _mauticContactId:      pick(body.field1),
    woning_adres:          [body.hstreet, body.hhouseno, body.hzipcode, body.hcity].filter(Boolean).join(' ').trim(),
    otd_aanhef:            pick(body.otd_aanhef, body.aanhef, body.saluation, body.salutation, body.title),
    otd_initialen:         pick(body.otd_initialen, body.initials, body.initialen, body.inits, body.voorletters),
    otd_voornamen:         pick(body.otd_voornamen, body.christianname, body.voornamen, body.firstnames, body.firstname_full),
    geboortedatum:          dateOnly(body.geboortedatum, body.geboorte_datum, body.birthdate, body.birth_date, body.birthday, body.dateofbirth, body.date_of_birth, body.rbirthdate, body.rbirth_date, body.rdatebirth, body.pbirthdate, body.pbirth_date, body.prbirthdate, body.prbirth_date, body.prdatebirth, body.bdate, body.dob),
    otd_geboorteplaats:    pick(body.otd_geboorteplaats, body.rbirthcity, body.prbirthcity, body.geboorteplaats, body.birthplace, body.birth_place, body.pobirth),
    otd_burgerlijke_staat: agreementLabel,
  }
}];
};
