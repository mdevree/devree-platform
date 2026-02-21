import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "@/lib/projectTypes";

/**
 * GET /api/projecten
 * Haal projecten op met filters
 * Query params:
 * - type: VERKOOP | AANKOOP | TAXATIE
 * - status: exacte ProjectStatus enum waarde
 * - statusGroup: lead | active | terminal
 * - search: zoekterm
 * - page, limit: paginatie
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const statusGroup = searchParams.get("statusGroup");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (type) {
    where.type = type;
  }

  if (statusGroup === "lead") {
    where.projectStatus = "LEAD";
  } else if (statusGroup === "active") {
    where.projectStatus = { in: ACTIVE_STATUSES };
  } else if (statusGroup === "terminal") {
    where.projectStatus = { in: TERMINAL_STATUSES };
  } else if (status) {
    // Probeer eerst als nieuwe enum status, anders legacy string status
    if (status === status.toUpperCase()) {
      where.projectStatus = status;
    } else {
      where.status = status;
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { woningAdres: { contains: search } },
      { contactName: { contains: search } },
      { contactEmail: { contains: search } },
    ];
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        _count: { select: { tasks: true, calls: true } },
        calls: { select: { id: true, _count: { select: { notes: true } } } },
        tasks: { select: { totalTimeSpent: true } },
        contacts: { select: { id: true, mauticContactId: true, role: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  const projectsWithTime = projects.map((p) => ({
    ...p,
    totalTimeSpent: p.tasks.reduce((sum, t) => sum + t.totalTimeSpent, 0),
    tasks: undefined,
  }));

  return NextResponse.json({
    projects: projectsWithTime,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/projecten
 * Maak een nieuw project aan
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.name) {
    return NextResponse.json(
      { error: "Projectnaam is verplicht" },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      // Nieuw type-systeem
      type: data.type || "VERKOOP",
      projectStatus: data.projectStatus || "LEAD",
      // Legacy status (backward-compat voor bestaande code)
      status: data.status || "lead",
      // Verkoopstart
      verkoopstart: data.verkoopstart || null,
      startdatum: data.startdatum ? new Date(data.startdatum) : null,
      startReden: data.startReden || null,
      // Legacy velden
      address: data.address || null,
      notionPageId: data.notionPageId || null,
      mauticContactId: data.mauticContactId || null,
      realworksId: data.realworksId || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      // Woning
      woningAdres: data.woningAdres || null,
      woningPostcode: data.woningPostcode || null,
      woningPlaats: data.woningPlaats || null,
      kadGemeente: data.kadGemeente || null,
      kadSectie: data.kadSectie || null,
      kadNummer: data.kadNummer || null,
      woningOppervlakte: data.woningOppervlakte || null,
      // Commercieel
      vraagprijs: data.vraagprijs ? parseInt(data.vraagprijs) : null,
      courtagePercentage: data.courtagePercentage || null,
      verkoopmethode: data.verkoopmethode || null,
      bijzondereAfspraken: data.bijzondereAfspraken || null,
      // Kosten
      kostenPubliciteit: data.kostenPubliciteit ?? null,
      kostenEnergielabel: data.kostenEnergielabel ?? null,
      kostenJuridisch: data.kostenJuridisch ?? null,
      kostenBouwkundig: data.kostenBouwkundig ?? null,
      kostenIntrekking: data.kostenIntrekking ?? null,
      kostenBedenktijd: data.kostenBedenktijd ?? null,
    },
    include: {
      _count: { select: { tasks: true, calls: true } },
    },
  });

  return NextResponse.json({ success: true, project }, { status: 201 });
}

/**
 * PATCH /api/projecten
 * Werk een project bij
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.id) {
    return NextResponse.json(
      { error: "Project ID is verplicht" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  // Basis
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  // Nieuw type-systeem
  if (data.type !== undefined) updateData.type = data.type;
  if (data.projectStatus !== undefined) updateData.projectStatus = data.projectStatus;
  // Legacy status
  if (data.status !== undefined) updateData.status = data.status;
  // Verkoopstart
  if (data.verkoopstart !== undefined) updateData.verkoopstart = data.verkoopstart;
  if (data.startdatum !== undefined) updateData.startdatum = data.startdatum ? new Date(data.startdatum) : null;
  if (data.startReden !== undefined) updateData.startReden = data.startReden;
  // Legacy velden
  if (data.address !== undefined) updateData.address = data.address;
  if (data.notionPageId !== undefined) updateData.notionPageId = data.notionPageId;
  if (data.mauticContactId !== undefined) updateData.mauticContactId = data.mauticContactId;
  if (data.realworksId !== undefined) updateData.realworksId = data.realworksId;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;
  // Woning
  if (data.woningAdres !== undefined) updateData.woningAdres = data.woningAdres;
  if (data.woningPostcode !== undefined) updateData.woningPostcode = data.woningPostcode;
  if (data.woningPlaats !== undefined) updateData.woningPlaats = data.woningPlaats;
  if (data.kadGemeente !== undefined) updateData.kadGemeente = data.kadGemeente;
  if (data.kadSectie !== undefined) updateData.kadSectie = data.kadSectie;
  if (data.kadNummer !== undefined) updateData.kadNummer = data.kadNummer;
  if (data.woningOppervlakte !== undefined) updateData.woningOppervlakte = data.woningOppervlakte;
  // Commercieel
  if (data.vraagprijs !== undefined) updateData.vraagprijs = data.vraagprijs ? parseInt(data.vraagprijs) : null;
  if (data.courtagePercentage !== undefined) updateData.courtagePercentage = data.courtagePercentage;
  if (data.verkoopmethode !== undefined) updateData.verkoopmethode = data.verkoopmethode || null;
  if (data.bijzondereAfspraken !== undefined) updateData.bijzondereAfspraken = data.bijzondereAfspraken;
  // Kosten
  if (data.kostenPubliciteit !== undefined) updateData.kostenPubliciteit = data.kostenPubliciteit ?? null;
  if (data.kostenEnergielabel !== undefined) updateData.kostenEnergielabel = data.kostenEnergielabel ?? null;
  if (data.kostenJuridisch !== undefined) updateData.kostenJuridisch = data.kostenJuridisch ?? null;
  if (data.kostenBouwkundig !== undefined) updateData.kostenBouwkundig = data.kostenBouwkundig ?? null;
  if (data.kostenIntrekking !== undefined) updateData.kostenIntrekking = data.kostenIntrekking ?? null;
  if (data.kostenBedenktijd !== undefined) updateData.kostenBedenktijd = data.kostenBedenktijd ?? null;

  const project = await prisma.project.update({
    where: { id: data.id },
    data: updateData,
    include: {
      _count: { select: { tasks: true, calls: true } },
      contacts: true,
    },
  });

  // Backward-compat: als mauticContactId meegegeven, ook upserten in project_contacts
  if (data.mauticContactId) {
    await prisma.projectContact.upsert({
      where: {
        projectId_mauticContactId: {
          projectId: data.id,
          mauticContactId: data.mauticContactId,
        },
      },
      update: {},
      create: {
        projectId: data.id,
        mauticContactId: data.mauticContactId,
        role: "opdrachtgever",
      },
    });
  }

  return NextResponse.json({ success: true, project });
}

/**
 * DELETE /api/projecten
 * Verwijder een project (ontkoppelt taken en calls eerst)
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: "Project ID is verplicht" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    }),
    prisma.call.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    }),
    prisma.project.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
