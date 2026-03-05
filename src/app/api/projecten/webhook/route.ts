import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/projecten/webhook
 * Ontvang project data van n8n
 * - Met notionPageId: upsert op basis van notionPageId
 * - Zonder notionPageId: maak nieuw project aan (bijv. vanuit NWWI taxatie flow)
 */
export async function POST(request: NextRequest) {
  try {
    // Webhook secret verificatie
    const webhookSecret = request.headers.get("x-webhook-secret");
    if (
      process.env.N8N_WEBHOOK_SECRET &&
      webhookSecret !== process.env.N8N_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const data = payload.body || payload;

    if (!data.name && !data.notionPageId) {
      return NextResponse.json(
        { error: "name of notionPageId is verplicht" },
        { status: 400 }
      );
    }

    const mauticContactId = data.mauticContactId ? parseInt(data.mauticContactId) : null;

    // Hypotheekadviseur koppelen via ID of naam
    let hypotheekAdviseurId: string | null = null;
    if (data.hypotheekAdviseurId) {
      hypotheekAdviseurId = data.hypotheekAdviseurId;
    } else if (data.hypotheekAdviseurNaam) {
      const adviseur = await prisma.hypotheekAdviseur.findFirst({
        where: { naam: data.hypotheekAdviseurNaam, actief: true },
      });
      if (adviseur) {
        hypotheekAdviseurId = adviseur.id;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectData: any = {
      name: data.name || "Naamloos project",
      description: data.description || null,
      type: data.type || "VERKOOP",
      projectStatus: data.projectStatus || "LEAD",
      status: data.status || "lead",
      address: data.address || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      mauticContactId,
      // Woning velden
      woningAdres: data.woningAdres || null,
      woningPostcode: data.woningPostcode || null,
      woningPlaats: data.woningPlaats || null,
    };

    if (hypotheekAdviseurId) {
      projectData.hypotheekAdviseurId = hypotheekAdviseurId;
    }

    let project;

    if (data.notionPageId) {
      // Upsert op basis van notionPageId (bestaande Notion sync flow)
      project = await prisma.project.upsert({
        where: { notionPageId: data.notionPageId },
        update: projectData,
        create: {
          ...projectData,
          notionPageId: data.notionPageId,
        },
      });
    } else {
      // Nieuw project aanmaken (bijv. vanuit n8n NWWI taxatie flow)
      project = await prisma.project.create({
        data: projectData,
      });
    }

    // Als er een mauticContactId meegegeven is, ook upserten in project_contacts
    if (mauticContactId) {
      await prisma.projectContact.upsert({
        where: {
          projectId_mauticContactId: {
            projectId: project.id,
            mauticContactId,
          },
        },
        update: {},
        create: {
          projectId: project.id,
          mauticContactId,
          role: "opdrachtgever",
        },
      });
    }

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        projectStatus: project.projectStatus,
        status: project.status,
        hypotheekAdviseurId: project.hypotheekAdviseurId,
      },
      action: project.createdAt.getTime() === project.updatedAt.getTime() ? "created" : "updated",
    });
  } catch (error) {
    console.error("Projecten webhook fout:", error);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
