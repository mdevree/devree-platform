import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { escapeHtml } from "../../app/api/projecten/[id]/otd/pdf/shared";
import { renderPdf } from "../renderPdf";
import { EtalageError, trustedImage } from "./source";
import {
  chosenPrice,
  imageStyle,
  indices,
  price,
  validateSheet,
  type Draft,
  type Photo,
  type Sheet,
} from "./model";

async function imageData(photo: Photo) {
  if (!trustedImage(photo.url)) throw new EtalageError("Ongeldige fotobron.");
  const error = () =>
    new EtalageError(
      "Ophalen van foto ‘" +
        photo.label +
        "’ is mislukt. Kies een andere foto of probeer opnieuw.",
      502,
    );
  let res: Response;
  try {
    res = await fetch(photo.url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw error();
  }
  const type = res.headers.get("content-type")?.split(";")[0];
  if (
    !res.ok ||
    !type ||
    !["image/jpeg", "image/png", "image/webp"].includes(type)
  )
    throw error();
  const bytes = await res.arrayBuffer();
  return "data:" + type + ";base64," + Buffer.from(bytes).toString("base64");
}
async function asset(file: string, type: string) {
  const bytes = await readFile(join(process.cwd(), "public", "etalage", file));
  return "data:image/" + type + ";base64," + bytes.toString("base64");
}
export async function sheetHtml(d: Draft, photos: Photo[], sheet: Sheet) {
  const issue = validateSheet(d, photos, sheet);
  if (issue) throw new EtalageError(issue);
  const pages =
    sheet === "set"
      ? [0, 1, 2]
      : [sheet === "voorblad" ? 0 : sheet === "fotoblad-1" ? 1 : 2];
  const media = new Map(photos.map((p) => [p.id, p]));
  const selected = indices(sheet).map((i) => d.slots[i].id!);
  const files = new Map(
    await Promise.all(
      [...new Set(selected)].map(
        async (id) => [id, await imageData(media.get(id)!)] as const,
      ),
    ),
  );
  const [logo, coverFoot, galleryFoot] = await Promise.all([
    asset("logo.jpg", "jpeg"),
    asset("voet-1.png", "png"),
    asset("voet-2.png", "png"),
  ]);
  function picture(i: number, left: number, top: number) {
    const s = d.slots[i],
      p = media.get(s.id!)!;
    const crop = imageStyle(p, s, i === 0);
    return `<div class="picture" style="left:${left}pt;top:${top}pt;width:${i ? 256 : 481}pt;height:${i ? 192 : 321}pt"><img style="left:${crop.left};top:${crop.top};width:${crop.width};height:${crop.height}" src="${files.get(p.id)}"></div>`;
  }
  const cover = () =>
    picture(0, 57, 83) +
    `<header><span>${escapeHtml(d.source.street)}</span><span>${escapeHtml(d.source.city)}</span></header>
    <article>${escapeHtml(d.text)}</article><aside><strong>${escapeHtml(d.source.priceLabel)} : ${price(chosenPrice(d))} ${escapeHtml(d.source.condition)}</strong><br><b>Oplevering:</b> ${escapeHtml(d.source.delivery)}</aside>`;
  // These are the six mask positions measured on each original Pages photo sheet.
  const frames = [
    [[40, 96], [307, 96], [40, 315], [307, 315], [40, 533], [307, 533]],
    [[40, 96], [318, 95], [40, 315], [307, 315], [40, 533], [307, 533]],
  ];
  const content = pages.map(page => {
    const isCover = page === 0;
    const body = isCover ? cover() : frames[page - 1].map(([left, top], index) =>
      picture(1 + (page - 1) * 6 + index, left, top)
    ).join("");
    return `<section><img class="logo" style="top:${isCover ? 29 : 31}pt" src="${logo}">
      ${body}<img class="foot" src="${isCover ? coverFoot : galleryFoot}"></section>`;
  }).join("");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Etalage</title><style>
    @page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Liberation Sans",sans-serif;color:black}
    section{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page}section:last-child{break-after:auto}
    .logo,.foot,.picture,.picture img,header,article,aside{position:absolute}.logo{left:240pt;width:115pt;height:39pt}
    .foot{left:0;top:760pt;width:595.25pt;height:77.5pt}.picture{overflow:hidden}
    header{top:407pt;left:60.5pt;width:473.5pt;display:flex;justify-content:space-between;gap:8pt;border-bottom:1.6pt solid;line-height:22pt;font-size:20pt;text-transform:uppercase;font-weight:bold;white-space:nowrap}
    article{top:443pt;left:60.5pt;width:477pt;height:283pt;font-size:12pt;line-height:14pt;text-align:justify;white-space:pre-line;overflow-wrap:anywhere}
    aside{top:733pt;left:60.5pt;width:477pt;height:28pt;font-size:12pt;line-height:14pt}
    </style></head><body>${content}<script>
    window.addEventListener('load',async()=>{
      await document.fonts.ready;
      const h=document.querySelector('header');
      if(h){let size=20;while(h.scrollWidth>h.clientWidth+1 && size>13){h.style.fontSize=(--size)+'pt'}}
      const overflow=[...document.querySelectorAll('article,header,aside')].some(e=>e.scrollHeight>e.clientHeight+1 || e.scrollWidth>e.clientWidth+1);
      const badImage=[...document.images].some(im=>!im.complete || !im.naturalWidth);
      if(overflow || badImage){
        document.title=badImage?'Etalage-image-error':'Etalage-text-overflow';
        document.body.appendChild(document.createElement('section'));
      }
      window.etalageReady=true;
    });</script></body></html>`;
}
export async function etalagePdf(d: Draft, photos: Photo[], sheet: Sheet) {
  const bytes = await renderPdf(
    await sheetHtml(d, photos, sheet),
    "window.etalageReady === true",
  );
  const doc = await PDFDocument.load(bytes);
  if (doc.getTitle() === "Etalage-image-error")
    throw new EtalageError(
      "Een geselecteerde foto kan niet worden afgedrukt. Kies een andere foto.",
    );
  if (
    doc.getPageCount() !== (sheet === "set" ? 3 : 1) ||
    doc.getTitle() === "Etalage-text-overflow"
  )
    throw new EtalageError(
      "De tekst past niet op het voorblad. Kort de verkooptekst in en controleer de adres- en prijsregel.",
    );
  return bytes;
}
