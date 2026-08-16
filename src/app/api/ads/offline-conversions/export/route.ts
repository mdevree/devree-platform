import { NextRequest, NextResponse } from "next/server";
import { buildOfflineConversionExport } from "@/lib/adsAttribution";
import { isAuthorized } from "@/lib/apiAuth";

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function fileDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
  const params = request.nextUrl.searchParams;
  const from = parseDate(params.get("from"), defaultFrom);
  const to = parseDate(params.get("to"), now);
  const format = params.get("format") === "review" ? "review" : "import";
  const markExported = params.get("markExported") === "1";

  const result = await buildOfflineConversionExport({
    from,
    to,
    markExported: format === "import" && markExported,
  });

  const csv = format === "review" ? result.reviewCsv : result.importCsv;
  const filename = format === "review"
    ? `google-ads-offline-review-${fileDate(from)}_${fileDate(to)}.csv`
    : `google-ads-offline-import-${fileDate(from)}_${fileDate(to)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Uploadable-Rows": String(result.uploadableRows),
      "X-Reviewed-Rows": String(result.reviewedRows),
      "X-Export-Batch-Id": result.batchId,
    },
  });
}
