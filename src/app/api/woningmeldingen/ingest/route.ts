import { NextRequest, NextResponse } from "next/server";
import { isMail, receiveHousingMail } from "@/lib/housingAlertService";

export async function POST(req: NextRequest) {
  if (
    !process.env.N8N_WEBHOOK_SECRET ||
    req.headers.get("x-webhook-secret") !== process.env.N8N_WEBHOOK_SECRET
  )
    return NextResponse.json({ error: "Geen toegang" }, { status: 401 });
  const mail = await req.json().catch(() => null);
  if (!mail || !isMail(mail))
    return NextResponse.json(
      { error: "Ongeldige notificatiemail" },
      { status: 400 },
    );
  const event = await receiveHousingMail({
    ...mail,
    verified: mail.verified === true,
  });
  return NextResponse.json({
    id: event.id,
    review: event.review,
    deliveries: event.deliveries,
  });
}
