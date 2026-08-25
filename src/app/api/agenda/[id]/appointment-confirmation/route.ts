import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { fetchWoningVanWordPress } from "@/lib/wordpress";
import {
  appointmentTokenHash,
  buildAppointmentWhatsappBody,
  createAppointmentToken,
  publicAppointmentPreviewUrl,
  publicAppointmentUrl,
} from "@/lib/appointmentConfirmation";

function buildAdres(project: { woningAdres: string | null; woningPostcode: string | null; woningPlaats: string | null } | null) {
  if (!project) return null;
  return [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ") || null;
}

function serializeConfirmation(confirmation: Awaited<ReturnType<typeof prisma.appointmentConfirmation.findUnique>>) {
  if (!confirmation) return null;
  return confirmation;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const [confirmation, draft] = await Promise.all([
    prisma.appointmentConfirmation.findUnique({
      where: { agendaAfspraakId: id },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    }),
    prisma.followUpDraft.findUnique({
      where: { agendaAfspraakId_purpose: { agendaAfspraakId: id, purpose: "afspraak_link" } },
    }),
  ]);

  return NextResponse.json({ confirmation: serializeConfirmation(confirmation), draft });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const afspraak = await prisma.agendaAfspraak.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          woningAdres: true,
          woningPostcode: true,
          woningPlaats: true,
          realworksId: true,
        },
      },
    },
  });

  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const existing = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
  });
  const token = existing ? null : createAppointmentToken();
  const publicUrl = existing?.publicUrl || publicAppointmentUrl(token!);
  const previewUrl = existing?.previewUrl || publicAppointmentPreviewUrl(token!);
  const woning = afspraak.project?.realworksId
    ? await fetchWoningVanWordPress(afspraak.project.realworksId)
    : null;
  const woningAdres = buildAdres(afspraak.project) || afspraak.aglocation || woning?.titel || afspraak.agdescr || null;
  const woningTitle = woning?.titel || afspraak.project?.name || afspraak.agdescr || null;
  const medewerker = afspraak.medewerkerFullname ?? afspraak.agowner;
  const whatsappBody = buildAppointmentWhatsappBody({
    woningTitle,
    woningAdres,
    appointmentStart: afspraak.agbegin,
    medewerker,
    publicUrl,
  });

  const confirmation = existing
    ? await prisma.appointmentConfirmation.update({
        where: { agendaAfspraakId: id },
        data: {
          recipientName: afspraak.contactNaam,
          recipientPhone: afspraak.contactTelefoon,
          recipientEmail: afspraak.contactEmail,
          mauticContactId: afspraak.mauticContactId,
          projectId: afspraak.projectId,
          woningTitle,
          woningAdres,
          woningUrl: woning?.link ?? null,
          appointmentStart: afspraak.agbegin,
          appointmentEnd: afspraak.agend,
          medewerker,
          whatsappBody,
          deliveryError: null,
        },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      })
    : await prisma.appointmentConfirmation.create({
        data: {
      agendaAfspraakId: id,
      tokenHash: appointmentTokenHash(token!),
      publicUrl,
      previewUrl,
      recipientName: afspraak.contactNaam,
      recipientPhone: afspraak.contactTelefoon,
      recipientEmail: afspraak.contactEmail,
      mauticContactId: afspraak.mauticContactId,
      projectId: afspraak.projectId,
      woningTitle,
      woningAdres,
      woningUrl: woning?.link ?? null,
      appointmentStart: afspraak.agbegin,
      appointmentEnd: afspraak.agend,
      medewerker,
      whatsappBody,
        },
        include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      });

  return NextResponse.json({ confirmation, token }, { status: existing ? 200 : 201 });
}
