import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function priorityToTask(priority: string) {
  if (priority === "urgent") return "urgent";
  if (priority === "high") return "hoog";
  if (priority === "low") return "laag";
  return "normaal";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const session = await auth();
  const body = await request.json().catch(() => ({}));
  const opportunity = await prisma.actionOpportunity.findUnique({ where: { id } });
  if (!opportunity) {
    return NextResponse.json({ error: "Kans niet gevonden" }, { status: 404 });
  }

  let user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null;
  if (!user) {
    user = await prisma.user.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
  }
  if (!user) {
    return NextResponse.json({ error: "Geen gebruiker gevonden voor taak" }, { status: 400 });
  }

  const extraNote =
    typeof body.note === "string" && body.note.trim() ? `\n\nNotitie: ${body.note.trim()}` : "";
  const description = [
    opportunity.reason,
    opportunity.contactName ? `Contact: ${opportunity.contactName}` : null,
    opportunity.contactPhone ? `Telefoon: ${opportunity.contactPhone}` : null,
    opportunity.contactEmail ? `E-mail: ${opportunity.contactEmail}` : null,
    opportunity.objectAddress ? `Object: ${opportunity.objectAddress}${opportunity.objectCity ? `, ${opportunity.objectCity}` : ""}` : null,
    opportunity.mauticContactId ? `Mautic: ${opportunity.mauticContactId}` : null,
    opportunity.realworksSearcherId ? `Realworks zoeker: ${opportunity.realworksSearcherId}` : null,
    opportunity.exchangeObjectId ? `Exchange object: ${opportunity.exchangeObjectId}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const task = opportunity.taskId
    ? await prisma.task.update({
        where: { id: opportunity.taskId },
        data: { status: "open", assigneeId: user.id },
      })
    : await prisma.task.create({
        data: {
          title: `Kans opvolgen: ${opportunity.title}`,
          description: `${description}${extraNote}`,
          status: "open",
          priority: priorityToTask(opportunity.priority),
          category: "aankoop",
          assigneeId: user.id,
          creatorId: user.id,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

  const updated = await prisma.actionOpportunity.update({
    where: { id },
    data: {
      status: "picked_up",
      taskId: task.id,
      pickedUpAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, opportunity: updated, task });
}
