import { prisma } from "@/lib/prisma";
import { readTaxatieDossier } from "@/lib/taxatieDossierStore";

export async function loadProjectTaxatieDossier(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      type: true,
      projectStatus: true,
      status: true,
      address: true,
      woningAdres: true,
      woningPostcode: true,
      woningPlaats: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      createdAt: true,
      taxatieMailArchives: {
        select: { nextcloudPath: true },
        where: { nextcloudPath: { not: null } },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
    },
  });
  if (!project) throw new Error("Taxatieproject niet gevonden");
  if (project.type !== "TAXATIE") throw new Error("Project is geen taxatie");
  return readTaxatieDossier(project, project.taxatieMailArchives.map((archive) => archive.nextcloudPath));
}
