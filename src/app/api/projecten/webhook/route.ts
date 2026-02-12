import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/projecten/webhook
 * Ontvang project data van n8n (Notion sync)
 * Upsert op basis van notionPageId
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

    if (!data.notionPageId) {
      return NextResponse.json(
        { error: "notionPageId is verplicht" },
        { status: 400 }
      );
    }

    const projectData = {
      name: data.name || "Naamloos project",
      description: data.description || null,
      status: data.status || "lead",
      address: data.address || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      mauticContactId: data.mauticContactId ? parseInt(data.mauticContactId) : null,
    };

    const project = await prisma.project.upsert({
      where: { notionPageId: data.notionPageId },
      update: projectData,
      create: {
        ...projectData,
        notionPageId: data.notionPageId,
      },
    });

    return NextResponse.json({
      success: true,
      project: { id: project.id, name: project.name, status: project.status },
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
