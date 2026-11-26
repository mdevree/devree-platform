import { type NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "../apiAuth";
import { prisma } from "../prisma";
import { EtalageError } from "./source";

export type Context = { params: Promise<{ id: string }> };
export async function projectForEtalage(request: NextRequest, ctx: Context) {
  if (!(await isAuthorized(request)))
    throw new EtalageError("Niet ingelogd.", 401);
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      realworksId: true,
      address: true,
      woningAdres: true,
      woningPlaats: true,
      projectStatus: true,
      aanvaarding: true,
      vraagprijs: true,
      etalage: true,
    },
  });
  if (project?.type !== "VERKOOP")
    throw new EtalageError("Verkoopproject niet gevonden.", 404);
  return project;
}
export async function body(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    throw new EtalageError("Ongeldig verzoek.", 400);
  }
}
export function failure(e: unknown) {
  if (e instanceof EtalageError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("Etalage:", e instanceof Error ? e.name : "onbekende fout");
  return NextResponse.json(
    { error: "Het etalageblad kon niet worden verwerkt. Probeer het opnieuw." },
    { status: 502 },
  );
}
