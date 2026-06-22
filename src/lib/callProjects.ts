import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

type AutoLinkedProject = {
  id: string;
  name: string;
  status: string;
};

const activeProjectFilter: Prisma.ProjectWhereInput = {
  OR: [
    { projectStatus: null },
    { projectStatus: { notIn: ["AFGEROND", "GEANNULEERD"] } },
  ],
};

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * Zoek een project dat met redelijke zekerheid bij een call hoort.
 * We koppelen alleen automatisch wanneer er precies een match is.
 */
export async function findAutoProjectForCall({
  mauticContactId,
  contactNumber,
}: {
  mauticContactId: number | null;
  contactNumber: string;
}): Promise<AutoLinkedProject | null> {
  const phoneFormats = contactNumber ? normalizePhoneNumber(contactNumber) : null;
  const phoneVariants = uniqueValues(
    phoneFormats
      ? [contactNumber, phoneFormats.clean, phoneFormats.plus31, phoneFormats.withDash]
      : [contactNumber]
  );

  const matchConditions: Prisma.ProjectWhereInput[] = [];

  if (mauticContactId) {
    matchConditions.push(
      { mauticContactId },
      { contacts: { some: { mauticContactId } } }
    );
  }

  if (phoneVariants.length > 0) {
    matchConditions.push({ contactPhone: { in: phoneVariants } });
  }

  if (matchConditions.length === 0) return null;

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        activeProjectFilter,
        { OR: matchConditions },
      ],
    },
    select: { id: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 2,
  });

  return projects.length === 1 ? projects[0] : null;
}
