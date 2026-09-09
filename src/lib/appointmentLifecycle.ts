export type AppointmentPhase = "before" | "after" | "cancelled";
type Schedule = { agbegin: Date | null; agend: Date | null; agstatus: string | null; aginactive: boolean | null };
export type AppointmentTiming = {
  status: string;
  appointmentStart: Date | null;
  appointmentEnd: Date | null;
  agendaAfspraak?: Schedule | null;
};
export function appointmentTiming(value: AppointmentTiming) {
  const start = value.agendaAfspraak ? value.agendaAfspraak.agbegin : value.appointmentStart;
  const rawEnd = value.agendaAfspraak ? value.agendaAfspraak.agend : value.appointmentEnd;
  const end = rawEnd && (!start || rawEnd > start) ? rawEnd : start ? new Date(start.getTime() + 30 * 60_000) : null;
  return { start, end };
}
export function appointmentPhase(value: AppointmentTiming, now = new Date()): AppointmentPhase {
  if (["cancel_requested", "cancelled"].includes(value.status) || value.agendaAfspraak?.aginactive || /annul|cancel/i.test(value.agendaAfspraak?.agstatus || "")) return "cancelled";
  const { end } = appointmentTiming(value);
  return end && now >= end ? "after" : "before";
}
export function appointmentPeriod(value: AppointmentTiming, at: Date) {
  const { start, end } = appointmentTiming(value);
  if (!start || !end) return "unknown";
  return at < start ? "before" : at < end ? "during" : "after";
}
export const APPOINTMENT_REVIEW_URL = "https://g.page/r/CWPIBb5Nw088EBM/review";
export function appointmentWhatsappUrl(address: string, start: Date | null) {
  // Verified against the WORKING business provider session; centrally overridable.
  const phone = (process.env.APPOINTMENT_WHATSAPP_NUMBER || "31181611919").replace(/\D/g, "");
  const date = start ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "long" }).format(start) : "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Goedemiddag, over de bezichtiging van ${address}${date ? ` op ${date}` : ""}: `)}`;
}
