import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { ensureDefaultDigitalEmployeeConfig } from "@/lib/aiBelassistent";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  await ensureDefaultDigitalEmployeeConfig();
  const profile = await prisma.aiAgentProfile.findFirst({
    where: { active: true, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  await ensureDefaultDigitalEmployeeConfig();
  const body = await req.json();
  const current = await prisma.aiAgentProfile.findFirst({
    where: { active: true, isDefault: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!current) return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });

  const profile = await prisma.aiAgentProfile.update({
    where: { id: current.id },
    data: {
      ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
      ...(typeof body.roleDescription === "string" ? { roleDescription: body.roleDescription } : {}),
      ...(typeof body.toneOfVoice === "string" ? { toneOfVoice: body.toneOfVoice } : {}),
      ...(typeof body.basePrompt === "string" ? { basePrompt: body.basePrompt } : {}),
      ...(Array.isArray(body.rules) ? { rules: body.rules.map(String) } : {}),
      ...(Array.isArray(body.forbiddenCommitments)
        ? { forbiddenCommitments: body.forbiddenCommitments.map(String) }
        : {}),
      ...(Array.isArray(body.domainVocabulary) ? { domainVocabulary: body.domainVocabulary.map(String) } : {}),
    },
  });

  return NextResponse.json(profile);
}
