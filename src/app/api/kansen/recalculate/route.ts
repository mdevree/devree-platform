import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { recalculateActionOpportunities } from "@/lib/actionOpportunities";

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const result = await recalculateActionOpportunities();
  return NextResponse.json({ success: true, ...result });
}
