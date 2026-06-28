import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { exportNewsletterIssue } from "@/lib/newsletter";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await exportNewsletterIssue(id);
    return NextResponse.json({
      success: true,
      mauticEmailId: result.mauticEmailId,
      mauticUrl: result.mauticEmailUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export naar Mautic mislukt" },
      { status: 400 }
    );
  }
}
