import type { Prisma, RealworksObjectMutation } from "@prisma/client";
import { listingType } from "./listingSearch";

export async function queueListingMatches(
  tx: Prisma.TransactionClient,
  row: RealworksObjectMutation,
) {
  if (row.mutationType !== "new" || !row.city) return;
  const searchType = listingType(row.objectKind, row.objectSubType);
  if (!searchType) return;
  const rules = await tx.housingAlertRule.findMany({
    where: {
      kind: "listing",
      mode: "draft",
      state: "active",
      city: row.city,
      searchType,
    },
    select: { id: true, activeFrom: true },
  });
  if (!rules.length) return;
  // A forwarded or replayed daily report must not introduce pre-existing stock.
  const first = await tx.realworksObjectMutation.aggregate({
    where: { exchangeObjectId: row.exchangeObjectId, mutationType: "new" },
    _min: { sourceDate: true, receivedAt: true },
  });
  const firstReport = Math.min(
    first._min.receivedAt!.getTime(),
    (first._min.sourceDate ?? row.mutationDate ?? row.receivedAt).getTime(),
  );
  const data = rules
    .filter((rule) => rule.activeFrom.getTime() <= firstReport)
    .map((rule) => ({
      ruleId: rule.id,
      mutationId: row.id,
      exchangeObjectId: row.exchangeObjectId,
    }));
  if (data.length)
    await tx.listingSearchJob.createMany({ data, skipDuplicates: true });
}
