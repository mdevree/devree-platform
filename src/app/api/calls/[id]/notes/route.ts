import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/calls/[id]/notes
 * Haal alle notities op van een gesprek
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const notes = await prisma.callNote.findMany({
    where: { callId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ notes });
}

/**
 * POST /api/calls/[id]/notes
 * Maak een nieuwe notitie aan en roep de webhook aan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { note } = await request.json();

  if (!note?.trim()) {
    return NextResponse.json({ error: "Notitie mag niet leeg zijn" }, { status: 400 });
  }

  // Haal call op voor context
  const call = await prisma.call.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!call) {
    return NextResponse.json({ error: "Gesprek niet gevonden" }, { status: 404 });
  }

  // Sla notitie op
  const callNote = await prisma.callNote.create({
    data: {
      callId: id,
      note: note.trim(),
      createdBy: session.user?.name || session.user?.email || "Onbekend",
    },
  });

  // Roep webhook aan als geconfigureerd
  const webhookUrl = process.env.CALL_NOTE_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET
            ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          noteId: callNote.id,
          callId: call.callId,
          timestamp: call.timestamp,
          direction: call.direction,
          callerNumber: call.callerNumber,
          callerName: call.callerName,
          destinationNumber: call.destinationNumber,
          mauticContactId: call.mauticContactId,
          contactName: call.contactName,
          projectId: call.projectId,
          projectName: call.project?.name || null,
          note: callNote.note,
          createdBy: callNote.createdBy,
          createdAt: callNote.createdAt,
        }),
      });
    } catch (err) {
      // Webhook fout mag notitie niet blokkeren
      console.error("Notitie webhook fout:", err);
    }
  }

  return NextResponse.json({ success: true, note: callNote });
}

/**
 * DELETE /api/calls/[id]/notes
 * Verwijder een notitie (via noteId in body)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { noteId } = await request.json();

  await prisma.callNote.deleteMany({
    where: { id: noteId, callId: id },
  });

  return NextResponse.json({ success: true });
}
