import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { parseIngest } from '@/lib/marketing/rules';

export async function POST(request: NextRequest) {
  const actual = request.headers.get('x-webhook-secret'), expected = process.env.N8N_WEBHOOK_SECRET;
  if (!actual || !expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  let batch: ReturnType<typeof parseIngest>;
  try {
    const text = await request.text();
    if (text.length > 1_000_000) throw new Error('size');
    batch = parseIngest(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: 'Ongeldige marketingmetingen' }, { status: 400 });
  }
  try {
    await prisma.$transaction(async tx => {
      for (const snapshot of batch.snapshots) {
        const { channelId, windowDays, capturedAt } = snapshot;
        await tx.marketingSnapshot.upsert({
          where: { channelId_windowDays_capturedAt: { channelId, windowDays, capturedAt } },
          create: snapshot, update: {},
        });
      }
      const existing = await tx.appSetting.findUnique({ where: { key: 'marketing_sync' } });
      const saved = existing?.value as { capturedAt?: string } | null;
      if (!saved?.capturedAt || saved.capturedAt <= batch.capturedAt.toISOString()) {
        const value = { capturedAt: batch.capturedAt.toISOString(), channels: batch.channels };
        await tx.appSetting.upsert({ where: { key: 'marketing_sync' }, create: { key: 'marketing_sync', value }, update: { value } });
      }
    }, { timeout: 30000 });
    return NextResponse.json({ accepted: batch.snapshots.length });
  } catch {
    console.error('Marketingimport mislukt');
    return NextResponse.json({ error: 'Import mislukt; batch kan opnieuw worden aangeboden' }, { status: 500 });
  }
}
