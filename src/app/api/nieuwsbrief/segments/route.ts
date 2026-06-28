import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { listSegments } from "@/lib/mautic";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const segments = await listSegments();
  return NextResponse.json({ segments });
}
