import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { createContact, searchContactByPhone, getContact, getContactFull, updateContact } from "@/lib/mautic";

/**
 * GET /api/mautic/contact?phone=0612345678
 * Zoek een contact in Mautic op telefoonnummer
 *
 * GET /api/mautic/contact?id=123
 * Haal contact details op via Mautic ID
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const phone = searchParams.get("phone");
  const id = searchParams.get("id");

  if (id) {
    const full = searchParams.get("full") === "1";
    const contact = full
      ? await getContactFull(parseInt(id))
      : await getContact(parseInt(id));
    if (!contact) {
      return NextResponse.json({ error: "Contact niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ contact });
  }

  if (phone) {
    const contact = await searchContactByPhone(phone);
    return NextResponse.json({
      found: !!contact,
      contact: contact || null,
    });
  }

  return NextResponse.json(
    { error: "phone of id parameter is verplicht" },
    { status: 400 }
  );
}

/**
 * POST /api/mautic/contact
 * Maak een nieuw contact aan in Mautic
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.firstname && !data.lastname) {
    return NextResponse.json(
      { error: "Voornaam of achternaam is verplicht" },
      { status: 400 }
    );
  }

  const contact = await createContact({
    firstname: data.firstname || "",
    lastname: data.lastname || "",
    phone: data.phone || undefined,
    mobile: data.mobile || undefined,
    email: data.email || undefined,
    company: data.company || undefined,
  });

  if (!contact) {
    return NextResponse.json(
      { error: "Kon contact niet aanmaken in Mautic" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, contact });
}

/**
 * PATCH /api/mautic/contact
 * Werk contact velden bij (inclusief AI profiel)
 * Body: { id: number, fields: Record<string, string | null> }
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.id) {
    return NextResponse.json({ error: "id is verplicht" }, { status: 400 });
  }

  const contact = await updateContact(parseInt(data.id), data.fields || {});

  if (!contact) {
    return NextResponse.json(
      { error: "Kon contact niet bijwerken in Mautic" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, contact });
}
