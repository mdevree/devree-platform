import { NextRequest, NextResponse } from "next/server";
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
  const draft = await sendFollowUpDraft(id, body.reviewedBy || null);
  const status = draft.status === "failed" ? 502 : 200;
  return NextResponse.json(draft, { status });
}
