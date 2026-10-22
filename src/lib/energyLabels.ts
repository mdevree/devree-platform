import { prisma } from "@/lib/prisma";
import { DAY, listingKind, mutationAddressKey } from "@/lib/energyLabelRules";

export async function reconcileEnergyLabels() {
  const signals = await prisma.energyLabelSignal.findMany({ where: { areaStatus: "matched", detail: null } });
  if (!signals.length) return;
  const mutations = await prisma.realworksObjectMutation.findMany({
    where: { receivedAt: { gte: new Date(Date.now() - 730 * DAY) } },
    select: { postcode:true, houseNumber:true, mutationType:true, mutationDate:true, receivedAt:true, rawText:true, exchangeObjectId:true },
    orderBy: { receivedAt:"asc" },
  });
  const byAddress = new Map<string, typeof mutations>();
  for (const m of mutations) {
    const key = mutationAddressKey(m.postcode,m.houseNumber);
    if (key) byAddress.set(key,[...(byAddress.get(key)||[]),m]);
  }
  const objects = new Map<string,Set<string>>();
  for (const s of signals) objects.set(s.canonicalKey,new Set([...(objects.get(s.canonicalKey)||[]),s.objectKey]));
  for (const s of signals) {
    if ((objects.get(s.canonicalKey)?.size || 0) > 1) continue;
    const matches = byAddress.get(s.canonicalKey) || [];
    const prior = matches.filter(m => m.receivedAt <= s.detectedAt).at(-1);
    const known = !!prior && !["removed","withdrawn"].includes(prior.mutationType);
    const after = matches.filter(m => m.mutationType === "new" && m.receivedAt > s.detectedAt && (!m.mutationDate || m.mutationDate.toISOString().slice(0,10) >= s.detectedAt.toISOString().slice(0,10)));
    const first = after.find(m => listingKind(m.rawText) === "sale") || after[0];
    // Persist evidence so market-object retention does not erase measured outcomes.
    if (known !== s.knownAtDiscovery || (first && (!s.firstListedAt || (s.listingKind !== "sale" && listingKind(first.rawText) === "sale")))) {
      await prisma.energyLabelSignal.update({where:{id:s.id},data:{knownAtDiscovery:known,
        ...(first ? {firstListedAt:first.receivedAt,listingSourceDate:first.mutationDate,listingKind:listingKind(first.rawText),exchangeObjectId:first.exchangeObjectId} : {})}});
    }
  }
}
