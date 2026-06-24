import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { ensureDefaultDigitalEmployeeConfig } from "@/lib/aiBelassistent";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  await ensureDefaultDigitalEmployeeConfig();
  const tasks = await prisma.aiAgentTask.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { displayName: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });

  const task = await prisma.aiAgentTask.update({
    where: { id: String(body.id) },
    data: {
      ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(typeof body.goal === "string" ? { goal: body.goal } : {}),
      ...(typeof body.channel === "string" ? { channel: body.channel } : {}),
      ...(Array.isArray(body.questions) ? { questions: body.questions.map(String) } : {}),
      ...(Array.isArray(body.allowedActions) ? { allowedActions: body.allowedActions.map(String) } : {}),
      ...(body.followUpPolicy && typeof body.followUpPolicy === "object"
        ? { followUpPolicy: body.followUpPolicy }
        : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    },
  });

  return NextResponse.json(task);
}
