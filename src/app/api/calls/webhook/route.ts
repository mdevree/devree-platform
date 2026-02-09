import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchContactByPhone } from "@/lib/mautic";
import {
  getContactNumber,
  calculateCallPoints,
  normalizePhoneNumber,
} from "@/lib/phone";
import { callEmitter, type CallEvent } from "@/lib/callStream";

/**
 * POST /api/calls/webhook
 * Ontvangt call data van n8n (Voys webhook doorgestuurd)
 * Verwerkt alle statussen: ringing, in-progress, ended
 */
export async function POST(request: NextRequest) {
  try {
    // Optionele webhook secret verificatie
    const webhookSecret = request.headers.get("x-webhook-secret");
    if (
      process.env.N8N_WEBHOOK_SECRET &&
      webhookSecret !== process.env.N8N_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();

    // Parse velden (zowel direct als genest via body)
    const data = payload.body || payload;

    const callId = data.call_id;
    const timestamp = data.timestamp
      ? new Date(data.timestamp)
      : new Date();
    const status = data.status || "unknown";
    const reason = data.reason || null;
    const direction = data.direction || "inbound";
    const callerNumber = data.caller?.number || data.caller_number || "";
    const callerName = data.caller?.name || data.caller_name || null;
    const destinationNumber =
      data.destination?.number || data.destination_number || "";
    const destinationUser =
      data.destination?.target?.user_emails?.[0] || data.destinationUser || null;

    if (!callId) {
      return NextResponse.json(
        { error: "call_id is verplicht" },
        { status: 400 }
      );
    }

    // Bepaal contactnummer
    const contactNumber = getContactNumber(
      direction,
      callerNumber,
      destinationNumber
    );

    // Zoek contact in Mautic
    let mauticContactId: number | null = null;
    let contactName: string | null = null;
    let contactFound = false;

    if (contactNumber) {
      try {
        const contact = await searchContactByPhone(contactNumber);
        if (contact) {
          mauticContactId = contact.id;
          contactName =
            `${contact.firstname} ${contact.lastname}`.trim() || null;
          contactFound = true;
        }
      } catch (error) {
        console.error("Mautic zoekfout:", error);
      }
    }

    // Bereken punten (alleen bij ended calls)
    const points =
      status === "ended" ? calculateCallPoints(direction, reason) : 0;

    // Opslaan of bijwerken in database
    const call = await prisma.call.upsert({
      where: { callId },
      update: {
        status,
        reason,
        mauticContactId,
        contactName,
        points,
        updatedAt: new Date(),
      },
      create: {
        callId,
        timestamp,
        status,
        reason,
        direction,
        callerNumber,
        callerName,
        destinationNumber,
        destinationUser,
        mauticContactId,
        contactName,
        points,
      },
    });

    // Push event naar alle verbonden SSE clients
    const eventType =
      status === "ended" ? "call-ended" : "call-ringing";

    const callEvent: CallEvent = {
      type: eventType as CallEvent["type"],
      data: {
        callId,
        timestamp: timestamp.toISOString(),
        status,
        reason: reason || undefined,
        direction,
        callerNumber,
        callerName: callerName || undefined,
        destinationNumber,
        destinationUser: destinationUser || undefined,
        mauticContactId: mauticContactId || undefined,
        contactName: contactName || undefined,
        contactFound,
      },
    };

    callEmitter.emit(callEvent);

    return NextResponse.json({
      success: true,
      callId: call.id,
      contactFound,
      contactName,
      eventType,
      connections: callEmitter.connectionCount,
    });
  } catch (error) {
    console.error("Webhook verwerking mislukt:", error);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
