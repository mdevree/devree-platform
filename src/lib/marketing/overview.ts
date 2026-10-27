import { prisma } from '@/lib/prisma';
import { Channel, Comparison, DAY, SPECS, compareDaily, compareSnapshot } from './rules';

export type MarketingCard = Comparison & {
  id: string; provider: string; name: string; account: string; unit: string; mode: string;
  note: string; capturedAt: string | null; stale: boolean; status: string;
};
export type MarketingOverview = { days: number; lastAttemptAt: string | null; cards: MarketingCard[] };

export async function getMarketingOverview(days: 7 | 30, now = new Date()): Promise<MarketingOverview> {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'marketing_sync' } });
  const health = setting?.value as { capturedAt: string; channels: Channel[] } | null;
  if (!health || !Array.isArray(health.channels)) return { days, lastAttemptAt: null, cards: [] };
  const order = Object.keys(SPECS);
  const channels = health.channels.filter(c => SPECS[c.provider]).sort((a,b) => order.indexOf(a.provider) - order.indexOf(b.provider));
  const cards = await Promise.all(channels.map(async channel => {
    const spec = SPECS[channel.provider];
    const windowDays = spec.mode === 'daily' ? 65 : spec.mode === 'stock' ? 7 : days;
    const snapshot = await prisma.marketingSnapshot.findFirst({ where: { channelId: channel.id, windowDays }, orderBy: { capturedAt: 'desc' } });
    let result: Comparison = { value: null, previous: null, delta: null, percent: null, start: null, end: null, previousStart: null, previousEnd: null, points: [], reason: 'Geen bruikbare brongegevens ontvangen.' };
    if (snapshot) {
      try {
        if (spec.mode === 'daily') result = compareDaily(snapshot, spec, days, now);
        else {
          const target = snapshot.capturedAt.getTime() - days * DAY;
          const previous = await prisma.marketingSnapshot.findFirst({
            where: { channelId: channel.id, windowDays, capturedAt: { gte: new Date(target - 90 * 60_000), lte: new Date(target + 90 * 60_000) } },
            orderBy: { capturedAt: 'desc' },
          });
          result = compareSnapshot(snapshot, previous, spec, days);
        }
      } catch { result.reason = 'De bronindeling is gewijzigd; meting controleren.'; }
    }
    const stale = !!snapshot && (now.getTime() - snapshot.capturedAt.getTime() > 30 * 3600_000 || channel.status !== 'ok');
    return { ...result, id: channel.id, provider: channel.provider, name: spec.name, account: channel.name, unit: spec.unit, mode: spec.mode, note: spec.note,
      capturedAt: snapshot?.capturedAt.toISOString() || null, stale, status: channel.status };
  }));
  return { days, lastAttemptAt: health.capturedAt, cards };
}
