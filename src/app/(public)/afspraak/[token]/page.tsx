import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  appointmentTokenHash,
  formatAppointmentDateTime,
  isValidAppointmentPreview,
} from "@/lib/appointmentConfirmation";
import AppointmentActions from "./AppointmentActions";
import AppointmentTracker from "./AppointmentTracker";

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
  const preview = query.preview === "1" && isValidAppointmentPreview(
    token,
    typeof query.previewUntil === "string" ? query.previewUntil : undefined,
    typeof query.previewSig === "string" ? query.previewSig : undefined
  );

  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
  });
  if (!confirmation) notFound();

  const afspraakLabel = formatAppointmentDateTime(confirmation.appointmentStart);
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

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:py-12">
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
      </section>
    </main>
  );
}
