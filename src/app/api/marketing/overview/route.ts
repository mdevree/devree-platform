import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/apiAuth';
import { getMarketingOverview } from '@/lib/marketing/overview';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  const days = request.nextUrl.searchParams.get('days') || '7';
  if (!['7','30'].includes(days)) return NextResponse.json({ error: 'Kies 7 of 30 dagen' }, { status: 400 });
  try {
    return NextResponse.json(await getMarketingOverview(Number(days) as 7 | 30), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    console.error('Marketingoverzicht kon niet worden geladen');
    return NextResponse.json({ error: 'Marketinggegevens tijdelijk niet beschikbaar' }, { status: 503 });
  }
}
