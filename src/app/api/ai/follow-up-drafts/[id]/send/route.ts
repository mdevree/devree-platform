import { NextRequest, NextResponse } from "next/server";
import { reviewEmail } from "@/lib/listingSearch";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { sendFollowUpDraft } from "@/lib/aiBelassistent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const record = await prisma.followUpDraft.findUnique({where: {id}, select: {purpose: true, status: true}});
  let approver;
  if (record?.purpose === "zoekmelding") {
    approver = (await auth())?.user?.email;
    if (approver?.toLowerCase() !== reviewEmail)
      return NextResponse.json({error: "Log in als Melvin om deze zoekmelding goed te keuren"}, {status: 403});
    if (record.status !== "approved")
      return NextResponse.json({error: "Keur eerst de berichttekst goed"}, {status: 409});
  }
  const draft = await sendFollowUpDraft(id, body.reviewedBy || null, approver);
  const status = ["failed","uncertain"].includes(draft.status) ? 502 : 200;
  return NextResponse.json(draft, { status });
}
