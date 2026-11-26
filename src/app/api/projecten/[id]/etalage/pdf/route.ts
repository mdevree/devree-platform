import { NextRequest, NextResponse } from "next/server";
import {
  body,
  failure,
  projectForEtalage,
  type Context,
} from "@/lib/etalage/api";
import { isDraft, sheets, type Sheet } from "@/lib/etalage/model";
import { EtalageError, listing } from "@/lib/etalage/source";
import { etalagePdf } from "@/lib/etalage/pdf";
import { slugPart } from "../../otd/pdf/shared";

export async function POST(request: NextRequest, ctx: Context) {
  try {
    const project = await projectForEtalage(request, ctx);
    const input = await body(request);
    if (
      !input ||
      !isDraft(input.draft) ||
      typeof input.sheet !== "string" ||
      !Object.hasOwn(sheets, input.sheet)
    )
      throw new EtalageError("Ongeldige bladkeuze of concept.", 400);
    if (input.draft.source.code !== (project.realworksId?.trim() || ""))
      throw new EtalageError(
        "De woningkoppeling is gewijzigd. Heropen het ontwerp.",
        409,
      );
    const { photos } = await listing(project);
    const bytes = await etalagePdf(input.draft, photos, input.sheet as Sheet);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'inline; filename="Etalage-' +
          slugPart(input.draft.source.street) +
          "-" +
          input.sheet +
          '.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
