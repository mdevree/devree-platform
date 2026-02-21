import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/projecten/[id]
 * Haal een enkel project op met alle taken en calls
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: { addedAt: "asc" },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, role: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      },
      calls: {
        include: {
          _count: { select: { notes: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Project niet gevonden" },
      { status: 404 }
    );
  }

  return NextResponse.json({ project });
}

/**
 * PATCH /api/projecten/[id]
 * Werk een enkel veld of meerdere velden bij
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.projectStatus !== undefined) updateData.projectStatus = data.projectStatus;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.verkoopstart !== undefined) updateData.verkoopstart = data.verkoopstart;
  if (data.startdatum !== undefined) updateData.startdatum = data.startdatum ? new Date(data.startdatum) : null;
  if (data.startReden !== undefined) updateData.startReden = data.startReden;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
  if (data.realworksId !== undefined) updateData.realworksId = data.realworksId;
  if (data.woningAdres !== undefined) updateData.woningAdres = data.woningAdres;
  if (data.woningPostcode !== undefined) updateData.woningPostcode = data.woningPostcode;
  if (data.woningPlaats !== undefined) updateData.woningPlaats = data.woningPlaats;
  if (data.kadGemeente !== undefined) updateData.kadGemeente = data.kadGemeente;
  if (data.kadSectie !== undefined) updateData.kadSectie = data.kadSectie;
  if (data.kadNummer !== undefined) updateData.kadNummer = data.kadNummer;
  if (data.woningOppervlakte !== undefined) updateData.woningOppervlakte = data.woningOppervlakte;
  if (data.vraagprijs !== undefined) updateData.vraagprijs = data.vraagprijs ? parseInt(data.vraagprijs) : null;
  if (data.courtagePercentage !== undefined) updateData.courtagePercentage = data.courtagePercentage;
  if (data.verkoopmethode !== undefined) updateData.verkoopmethode = data.verkoopmethode || null;
  if (data.bijzondereAfspraken !== undefined) updateData.bijzondereAfspraken = data.bijzondereAfspraken;
  if (data.kostenPubliciteit !== undefined) updateData.kostenPubliciteit = data.kostenPubliciteit ?? null;
  if (data.kostenEnergielabel !== undefined) updateData.kostenEnergielabel = data.kostenEnergielabel ?? null;
  if (data.kostenJuridisch !== undefined) updateData.kostenJuridisch = data.kostenJuridisch ?? null;
  if (data.kostenBouwkundig !== undefined) updateData.kostenBouwkundig = data.kostenBouwkundig ?? null;
  if (data.kostenIntrekking !== undefined) updateData.kostenIntrekking = data.kostenIntrekking ?? null;
  if (data.kostenBedenktijd !== undefined) updateData.kostenBedenktijd = data.kostenBedenktijd ?? null;

  const project = await prisma.project.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ success: true, project });
}
