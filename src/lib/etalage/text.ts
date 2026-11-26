import { PDFDocument, StandardFonts } from "pdf-lib";

// The Pages text box is 477pt wide and uses Arial 12pt on a 14pt baseline.
// Helvetica has compatible Latin advance widths. The renderer checks the final box again.
export async function suggestText(input: string) {
  const font = await (
    await PDFDocument.create()
  ).embedFont(StandardFonts.Helvetica);
  const measure = (word: string) =>
    font.widthOfTextAtSize(
      Array.from(word, (c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "M";
        }
      }).join(""),
      12,
    );
  let lines = 1,
    width = 0,
    result = "";
  for (const { segment } of new Intl.Segmenter("nl", {
    granularity: "sentence",
  }).segment(input)) {
    for (const word of segment.trim().split(/\s+/)) {
      const w = measure(word);
      if (w > 472) return result;
      if (width && width + 3.34 + w > 472) {
        lines++;
        width = 0;
      }
      width += (width ? 3.34 : 0) + w;
    }
    if (lines > 19) break;
    result += (result ? " " : "") + segment.trim();
  }
  return result;
}
