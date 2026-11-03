const amsterdam = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

/** Realworks supplies Amsterdam wall time without an offset.
 * Try both Dutch offsets and round-trip through the IANA timezone rules.
 * At the autumn overlap, retain the earlier (summer-time) occurrence; the
 * source cannot distinguish the two. Reject nonexistent spring-forward times.
 */
export function parseRwDate(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const expected = { year, month, day, hour, minute, second };
  const wallTime = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  for (const offset of [2, 1]) {
    const candidate = new Date(wallTime - offset * 60 * 60 * 1000);
    const parts = Object.fromEntries(amsterdam.formatToParts(candidate).map(p => [p.type, p.value]));
    if (Object.entries(expected).every(([key, part]) => parts[key] === part)) return candidate;
  }
  return null;
}
