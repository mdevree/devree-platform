import { appointmentPhase, appointmentTiming, appointmentWhatsappUrl, APPOINTMENT_REVIEW_URL } from "@/lib/appointmentLifecycle";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  appointmentTokenHash,
  formatAppointmentDateTime,
  isValidAppointmentPreview,
} from "@/lib/appointmentConfirmation";
import AppointmentRefresh from "./AppointmentRefresh";
import AppointmentActions from "./AppointmentActions";
import AppointmentTracker from "./AppointmentTracker";

export const dynamic = "force-dynamic";

function formatAdres(confirmation: { woningAdres: string | null; woningTitle: string | null }) {
  return confirmation.woningAdres || confirmation.woningTitle || "de woning";
}

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const previewRequested = query.preview === "1";
  const preview = previewRequested && isValidAppointmentPreview(
    token,
    typeof query.previewUntil === "string" ? query.previewUntil : undefined,
    typeof query.previewSig === "string" ? query.previewSig : undefined
  );
  if (previewRequested && !preview) notFound();

  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    include: { agendaAfspraak: true },
  });
  if (!confirmation) notFound();

  const phase = appointmentPhase(confirmation);
  const timing = appointmentTiming(confirmation);
  const afspraakLabel = formatAppointmentDateTime(timing.start);
  const adres = formatAdres(confirmation);
  const videoUrl = `/api/public/afspraak/${encodeURIComponent(token)}/video${preview ? `?preview=1` : ""}`;
  const woningUrl = `/api/public/afspraak/${encodeURIComponent(token)}/woning`;

  return (
    <main className="min-h-screen bg-[#f7f7f3] text-[#27352f]">
      {preview && (
        <div className="bg-[#0f6b4f] px-4 py-2 text-center text-sm font-semibold text-white">
          Preview voor kantoor, geen tracking
        </div>
      )}
      <AppointmentTracker token={token} enabled={!preview} />
      <AppointmentRefresh enabled={phase === "before"} end={timing.end?.toISOString() || null} />

      <header className="border-b border-[#e1e4de] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="https://www.devreemakelaardij.nl/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.devreemakelaardij.nl/wp-content/uploads/2026/01/LOGO-1.png"
              alt="De Vree Makelaardij"
              className="h-12 w-auto"
            />
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#405249] md:flex">
            <a href="https://www.devreemakelaardij.nl/woning-verkopen/" className="hover:text-[#0f6b4f]">Verkopen</a>
            <a href="https://www.devreemakelaardij.nl/aankoopmakelaar/" className="hover:text-[#0f6b4f]">Aankopen</a>
            <a href="https://www.devreemakelaardij.nl/taxatie/" className="hover:text-[#0f6b4f]">Taxatie</a>
            <a href="https://www.devreemakelaardij.nl/contact/" className="hover:text-[#0f6b4f]">Contact</a>
          </nav>
        </div>
      </header>

      {phase === "after" ? <section className="mx-auto max-w-3xl space-y-6 px-5 py-10">
        <h1 className="text-3xl font-semibold">Na uw bezichtiging van {adres}</h1>
        <p>{afspraakLabel}</p>
        <p>Wat vindt u van de woning? Heeft u nog vragen of wilt u iets met ons bespreken?</p>
        <a data-appointment-event="whatsapp_click" href={appointmentWhatsappUrl(adres, timing.start)} className="inline-block rounded bg-[#0f6b4f] px-5 py-3 font-semibold text-white">Stuur ons een WhatsApp</a>
        {confirmation.woningUrl && <p><a className="underline" href={preview ? confirmation.woningUrl : woningUrl}>Bekijk de woning op onze website</a></p>}
        {confirmation.videoPath && <details className="rounded border p-4"><summary>Video van vóór de bezichtiging</summary><video data-appointment-video src={videoUrl} controls playsInline preload="metadata" className="mt-4 max-h-[60vh] w-full" /></details>}
        <section className="border-t pt-6"><h2 className="text-lg font-semibold">Hoe heeft u de bezichtiging ervaren?</h2><p className="mt-2 text-sm">Wilt u uw ervaring met het contact en de uitleg tijdens de bezichtiging delen? Dat kan met een review op Google.</p><a data-appointment-event="review_click" href={APPOINTMENT_REVIEW_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded border border-[#0f6b4f] px-4 py-2 text-sm">Deel uw ervaring op Google</a></section>
      </section> : phase === "cancelled" ? <section className="mx-auto max-w-3xl px-5 py-10"><h1 className="text-2xl font-semibold">Uw afspraak bij {adres} is geannuleerd</h1><p className="mt-4">Wilt u een nieuwe afspraak maken? Bel ons op <a href="tel:+31181611919">0181 - 611 919</a>.</p></section> : <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:py-12">
        <div className="overflow-hidden rounded-md bg-black shadow-sm">
          {confirmation.videoPath ? (
            <video
              data-appointment-video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-[#27352f] px-6 text-center text-white">
              De video is nog niet toegevoegd.
            </div>
          )}
        </div>

        <aside className="rounded-md border border-[#e1e4de] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#0f6b4f]">Bezichtiging</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-[#27352f]">
            Uw afspraak bij {adres}
          </h1>
          {confirmation.recipientName && (
            <p className="mt-4 text-base text-[#58635d]">
              Goedemiddag {confirmation.recipientName.split(/\s+/)[0]}, hierbij bevestigen wij uw bezichtiging.
            </p>
          )}

          <dl className="mt-6 space-y-4 border-y border-[#edf0eb] py-5 text-sm">
            {afspraakLabel && (
              <div>
                <dt className="font-semibold text-[#27352f]">Datum en tijd</dt>
                <dd className="mt-1 text-[#58635d]">{afspraakLabel}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-[#27352f]">Woning</dt>
              <dd className="mt-1 text-[#58635d]">{adres}</dd>
            </div>
            {confirmation.medewerker && (
              <div>
                <dt className="font-semibold text-[#27352f]">Makelaar</dt>
                <dd className="mt-1 text-[#58635d]">{confirmation.medewerker}</dd>
              </div>
            )}
          </dl>

          <p className="mt-5 text-sm leading-6 text-[#58635d]">
            Wij reserveren ongeveer 30 minuten voor de bezichtiging, zodat u rustig kunt rondkijken en uw vragen kunt stellen.
          </p>

          <p className="mt-5 text-sm text-[#58635d]">Ook na de bezichtiging kunt u deze pagina gebruiken om de woning terug te kijken of ons uw indruk te laten weten.</p>
          <div className="mt-6">
            <AppointmentActions token={token} preview={preview} initialStatus={confirmation.status} />
          </div>

          {confirmation.woningUrl && (
            <a
              href={preview ? confirmation.woningUrl : woningUrl}
              className="mt-5 inline-flex w-full justify-center rounded-md border border-[#0f6b4f] px-5 py-3 text-sm font-semibold text-[#0f6b4f] transition hover:bg-[#eef6f2]"
            >
              Bekijk de woning op onze website
            </a>
          )}
        </aside>
      </section>}
    </main>
  );
}
