type Location = {
  type: string;
  buurtnaam?: string;
  wijknaam?: string;
  gemeentenaam?: string;
  woonplaatsnaam?: string;
  postcode?: string;
  centroide_rd?: string;
};

const normalize = (value?: string) => value?.trim().toLowerCase();
const quote = (value: string) => '"' + value.replace(/["\\]/g, "\\$&") + '"';

async function locations(query: string, filter: string): Promise<Location[]> {
  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free");
  url.search = new URLSearchParams({
    q: query,
    fq: filter,
    rows: "10",
    fl: "type,woonplaatsnaam,gemeentenaam,buurtnaam,wijknaam,postcode,centroide_rd",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("PDOK is tijdelijk onbereikbaar");
  return (await response.json()).response.docs;
}

function point(doc?: Location) {
  const coords = doc?.centroide_rd?.match(/^POINT\(([\d.-]+) ([\d.-]+)\)$/);
  return coords ? { x: Number(coords[1]), y: Number(coords[2]) } : null;
}

export async function areaCenter(area: string, city: string) {
  const places = (await locations(city, "type:woonplaats")).filter(
    (p) => normalize(p.woonplaatsnaam) === normalize(city),
  );
  if (places.length !== 1 || !places[0].gemeentenaam) return null;
  const docs = await locations(
    area,
    "type:(wijk OR buurt) AND gemeentenaam:" + quote(places[0].gemeentenaam),
  );
  const exact = docs.filter(
    (d) =>
      normalize(d.type === "wijk" ? d.wijknaam : d.buurtnaam) ===
      normalize(area),
  );
  const districts = exact.filter((d) => d.type === "wijk");
  const chosen = districts.length ? districts : exact;
  return chosen.length === 1 ? point(chosen[0]) : null;
}

export async function postcodePoint(postcode: string, city: string) {
  const pc = postcode.replace(/\s/g, "").toUpperCase();
  if (!/^\d{4}[A-Z]{2}$/.test(pc)) return null;
  const docs = await locations(pc, "type:postcode AND postcode:" + pc);
  return point(
    docs.find(
      (d) =>
        d.postcode === pc && normalize(d.woonplaatsnaam) === normalize(city),
    ),
  );
}
