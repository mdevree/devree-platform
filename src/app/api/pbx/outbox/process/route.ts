import { NextResponse } from "next/server";
import { pbxServiceAuthorized } from "@/lib/pbx/auth";
import { processPbxOutbox } from "@/lib/pbx/outbox";
export const maxDuration = 90;
export async function POST(req: Request) {
  if (!pbxServiceAuthorized(req)) return new Response(null, { status: 401 });
  return NextResponse.json(await processPbxOutbox());
}
