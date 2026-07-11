import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import {
  getBezichtigingFollowUpLastRun,
  prepareBezichtigingFollowUpDrafts,
} from "@/lib/bezichtigingFollowUp";

/**
 * POST /api/ai/follow-up-drafts/prepare-bezichtigingen
 * Maakt WhatsApp-conceptberichten aan voor bezichtigingen van 24-48 uur geleden,
 * tenzij er sindsdien al contact is geweest. Verzendt niets; concepten worden
 * beoordeeld via de digitale medewerker. Aangeroepen door n8n (schedule) of
 * handmatig vanuit het dashboard. Body: { dryRun?: boolean }.
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await prepareBezichtigingFollowUpDrafts({ dryRun: body?.dryRun === true });
  return NextResponse.json(result);
}

/**
 * GET /api/ai/follow-up-drafts/prepare-bezichtigingen
 * Geeft de rapportage van de laatste (niet-dry-run) run terug.
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const lastRun = await getBezichtigingFollowUpLastRun();
  return NextResponse.json({ lastRun });
}
