import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/taken/[id]/timer
 * Haal de huidige timerstatus op van een taak
 *
 * Response:
 * {
 *   isRunning: boolean,
 *   timerStartedAt: string | null,
 *   totalTimeSpent: number,        // opgeslagen seconden (afgesloten sessies)
 *   currentSessionSeconds: number, // lopende sessie in seconden (0 als gestopt)
 *   totalSeconds: number,          // totalTimeSpent + currentSessionSeconds
 *   entries: TimeEntry[]
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      timerStartedAt: true,
      totalTimeSpent: true,
      timeEntries: {
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
  }

  const currentSessionSeconds = task.timerStartedAt
    ? Math.floor((Date.now() - new Date(task.timerStartedAt).getTime()) / 1000)
    : 0;

  return NextResponse.json({
    isRunning: !!task.timerStartedAt,
    timerStartedAt: task.timerStartedAt,
    totalTimeSpent: task.totalTimeSpent,
    currentSessionSeconds,
    totalSeconds: task.totalTimeSpent + currentSessionSeconds,
    entries: task.timeEntries,
  });
}

/**
 * POST /api/taken/[id]/timer
 * Beheer de timer van een taak
 *
 * Body: { action: "start" | "pause" | "stop" }
 *
 * - start: start een nieuwe sessie (fout als timer al loopt)
 * - pause: sluit huidige sessie af, totalTimeSpent += duur
 * - stop:  zelfde als pause maar bedoeld als definitief stoppen
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await request.json();

  if (!["start", "pause", "stop"].includes(action)) {
    return NextResponse.json(
      { error: "action moet start, pause of stop zijn" },
      { status: 400 }
    );
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, timerStartedAt: true, totalTimeSpent: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Taak niet gevonden" }, { status: 404 });
  }

  const now = new Date();

  if (action === "start") {
    if (task.timerStartedAt) {
      return NextResponse.json(
        { error: "Timer loopt al" },
        { status: 400 }
      );
    }

    const [updated] = await prisma.$transaction([
      prisma.task.update({
        where: { id },
        data: { timerStartedAt: now },
      }),
      prisma.timeEntry.create({
        data: { taskId: id, startedAt: now },
      }),
    ]);

    return NextResponse.json({
      action: "started",
      timerStartedAt: updated.timerStartedAt,
      totalTimeSpent: updated.totalTimeSpent,
    });
  }

  // pause of stop — sluit de lopende sessie af
  if (!task.timerStartedAt) {
    return NextResponse.json(
      { error: "Timer loopt niet" },
      { status: 400 }
    );
  }

  const sessionSeconds = Math.floor(
    (now.getTime() - new Date(task.timerStartedAt).getTime()) / 1000
  );
  const newTotal = task.totalTimeSpent + sessionSeconds;

  // Zoek de open TimeEntry op (stoppedAt is null)
  const openEntry = await prisma.timeEntry.findFirst({
    where: { taskId: id, stoppedAt: null },
    orderBy: { startedAt: "desc" },
  });

  await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: {
        timerStartedAt: null,
        totalTimeSpent: newTotal,
      },
    }),
    ...(openEntry
      ? [prisma.timeEntry.update({
          where: { id: openEntry.id },
          data: { stoppedAt: now, duration: sessionSeconds },
        })]
      : []),
  ]);

  return NextResponse.json({
    action: action === "stop" ? "stopped" : "paused",
    sessionSeconds,
    totalTimeSpent: newTotal,
  });
}

/**
 * DELETE /api/taken/[id]/timer
 * Reset de timer volledig (wist alle sessies en zet totalTimeSpent op 0)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.$transaction([
    prisma.timeEntry.deleteMany({ where: { taskId: id } }),
    prisma.task.update({
      where: { id },
      data: { timerStartedAt: null, totalTimeSpent: 0 },
    }),
  ]);

  return NextResponse.json({ action: "reset", totalTimeSpent: 0 });
}
