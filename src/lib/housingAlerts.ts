export const alertLabels = {
  listing: "Nieuw passend aanbod",
  sold: "Verkocht",
  conditional: "Verkocht onder voorbehoud",
  bid: "Onder bod",
  available: "Weer beschikbaar",
  price: "Vraagprijs gewijzigd",
};
export type AlertKind = keyof typeof alertLabels;
export const templates: Record<AlertKind, string> = {
  listing: "Hoi {voornaam}, ik zag nieuw aanbod aan {adres} in {plaats} dat bij je zoekwens past. Zal ik de gegevens voor je opvragen? Groet, Melvin",
  sold: "Hoi {voornaam}, zoals afgesproken laat ik je weten dat {adres} is verkocht voor {transactieprijs}. Groet, Melvin",
  conditional:
    "Hoi {voornaam}, {adres} is inmiddels verkocht onder voorbehoud. Groet, Melvin",
  bid: "Hoi {voornaam}, zoals afgesproken een update over {adres}. De woning is nu onder bod. Groet, Melvin",
  available: "Hoi {voornaam}, {adres} is weer beschikbaar. Groet, Melvin",
  price:
    "Hoi {voornaam}, de vraagprijs van {adres} is gewijzigd van {vorigevraagprijs} naar {vraagprijs}. Groet, Melvin",
};
export function isKind(value: unknown): value is AlertKind {
  return typeof value === "string" && Object.hasOwn(alertLabels, value);
}

export function addressKey(address: string, city: string) {
  const clean = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  // Realworks uses both “47 A” and “47A”. Keep punctuation that distinguishes units.
  return (
    clean(city) + "|" + clean(address).replace(/(\d)\s+(?=[a-z]\b)/g, "$1")
  );
}
export function usableAddress(address: string, city: string) {
  return (
    /^.{1,140}\s+\d{1,6}(?:[\s/-]*[a-z\d-]{1,10})?$/iu.test(address) &&
    address.length + city.length < 190 &&
    !!city.trim() &&
    city.length <= 80
  );
}
function readPrice(text: string, label: string) {
  const match = text.match(
    new RegExp(
      "\\b" +
        label +
        "\\s*:\\s*€\\s*((?:[1-9]\\d{0,2}(?:\\.\\d{3})+|[1-9]\\d*))(?:,-|,00)?(?=[\\s;!]|\\.(?!\\d)|$)",
      "i",
    ),
  );
  if (!match) return null;
  const n = Number(match[1].replaceAll(".", ""));
  return n <= 2147483647 ? n : null;
}
export function parseAlert(subject: string, body: string) {
  const text = body.replace(/\s+/g, " ").trim();
  const parts =
    /^Notificatie voor uitwisseling object:\s*(.+)\s+te\s+(.+?)\s*$/i.exec(
      subject.trim(),
    );
  const address = parts?.[1]?.trim() || "";
  const city = parts?.[2]?.trim() || "";
  const location =
    /(?:^|\s)Bij (.+?) te (.+?) is de volgende wijziging doorgevoerd/i.exec(
      text,
    );
  const key = addressKey(address, city);
  let review: string | null = null;
  if (
    !usableAddress(address, city) ||
    !location ||
    addressKey(location[1], location[2]) !== key
  )
    review = "Adres of plaats is niet eenduidig";
  const states: [AlertKind, RegExp][] = [
    ["conditional", /Dit object is nu Verkocht onder voorbehoud\b/i],
    ["sold", /Dit object is nu Verkocht(?=\s+met\s+Transactieprijs|[.!]|$)/i],
    ["bid", /Dit object is nu Onder bod\b/i],
    ["available", /Dit object is nu Beschikbaar\b/i],
  ];
  const matches = states.filter(([, pattern]) => pattern.test(text));
  const status = matches[0]?.[0] ?? null;
  const askingPrice = readPrice(text, "Vraagprijs");
  const transactionPrice = readPrice(text, "Transactieprijs");
  if (
    matches.length > 1 ||
    (!status &&
      !(
        askingPrice &&
        /Dit object is nu in de verkoop met Vraagprijs|vraagprijs (?:is )?gewijzigd/i.test(
          text,
        )
      ))
  )
    review ||= "Onbekende Realworks-melding";
  if (status === "sold" && !transactionPrice)
    review ||= "Transactieprijs ontbreekt";
  return {
    address,
    city,
    addressKey: key,
    status,
    askingPrice,
    transactionPrice,
    review,
  };
}
export type AlertValues = {
  voornaam: string;
  adres: string;
  plaats: string;
  vraagprijs: number | null;
  vorigevraagprijs: number | null;
  transactieprijs: number | null;
};
export function renderAlert(template: string, values: AlertValues) {
  return template.replace(/\{([^{}]+)\}/g, (token, key: string) => {
    const v = Object.hasOwn(values, key)
      ? values[key as keyof AlertValues]
      : null;
    if (v == null || v === "") throw new Error("Ontbrekend veld " + token);
    return typeof v === "number" ? "€ " + v.toLocaleString("nl-NL") : v;
  });
}
export function previewAlert(
  template: string,
  first: string,
  address: string,
  city: string,
) {
  return renderAlert(template, {
    voornaam: first,
    adres: address,
    plaats: city,
    vraagprijs: 385000,
    vorigevraagprijs: 395000,
    transactieprijs: 377500,
  });
}
