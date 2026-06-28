import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { getNewsletterDashboard } from "@/lib/newsletter";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const dashboard = await getNewsletterDashboard();
  return NextResponse.json(dashboard);
}
