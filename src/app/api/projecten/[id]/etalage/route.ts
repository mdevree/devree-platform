import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  body,
  failure,
  projectForEtalage,
  type Context,
} from "@/lib/etalage/api";
import { isDraft, priceChoice, suggestSlots } from "@/lib/etalage/model";
import { EtalageError, listing } from "@/lib/etalage/source";
import { suggestText } from "@/lib/etalage/text";

export async function GET(request: NextRequest, ctx: Context) {
  try {
    const project = await projectForEtalage(request, ctx);
    const { source, photos, hero } = await listing(project);
    const suggestion = await suggestText(source.description);
    const saved = project.etalage;
    if (saved && !isDraft(saved.document))
      throw new EtalageError(
        "Het opgeslagen concept heeft een onbekende indeling.",
        409,
      );
    const old = saved && isDraft(saved.document) ? saved.document : null;
    const relinked = old !== null && old.source.code !== source.code;
    const draft =
      old && !relinked
        ? old
        : {
            source,
            text: suggestion,
            slots: suggestSlots(photos, hero),
            priceSource: priceChoice(source),
          };
    return NextResponse.json(
      {
        source,
        photos,
        suggestion,
        draft,
        revision: saved?.revision ?? 0,
        relinked,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const project = await projectForEtalage(request, ctx);
    const input = await body(request);
    if (
      !input ||
      !isDraft(input.draft) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0
    )
      throw new EtalageError("Ongeldig etalageconcept.", 400);
    if (input.draft.source.code !== (project.realworksId?.trim() || ""))
      throw new EtalageError(
        "De woningkoppeling is gewijzigd. Open het project opnieuw.",
        409,
      );
    const document = input.draft as Prisma.InputJsonValue;
    const conflict = new EtalageError(
      "Een collega heeft dit concept gewijzigd. Heropen het ontwerp om de nieuwste versie te bekijken.",
      409,
    );
    if (input.revision === 0) {
      try {
        await prisma.projectEtalage.create({
          data: { projectId: project.id, document },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
          throw conflict;
        throw e;
      }
    } else {
      const result = await prisma.projectEtalage.updateMany({
        where: { projectId: project.id, revision: input.revision },
        data: { document, revision: { increment: 1 } },
      });
      if (!result.count) throw conflict;
    }
    return NextResponse.json({ revision: input.revision + 1 });
  } catch (e) {
    return failure(e);
  }
}
