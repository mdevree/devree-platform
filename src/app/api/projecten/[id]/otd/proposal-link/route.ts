import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import {
  createProposalToken,
  proposalExpiresAt,
  proposalTokenHash,
  publicProposalUrl,
} from "@/lib/projectProposal";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, type: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const token = createProposalToken();
  const expiresAt = proposalExpiresAt();
  const proposalUrl = publicProposalUrl(token);

  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      // Aankoop kent geen offertefase; de statusflow gaat direct naar OTD_VERSTUURD.
      data: { projectStatus: project.type === "AANKOOP" ? "OTD_VERSTUURD" : "OFFERTE_VERSTUURD" },
    }),
    prisma.projectProposal.updateMany({
      where: { projectId: id, status: "OPEN" },
      data: { status: "REVOKED" },
    }),
    prisma.projectProposal.create({
      data: {
        projectId: id,
        tokenHash: proposalTokenHash(token),
        publicUrl: proposalUrl,
        expiresAt,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    proposalUrl,
    expiresAt,
  });
}
