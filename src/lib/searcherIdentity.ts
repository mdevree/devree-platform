/** Older imports stored the short Realworks relation code in systemid.
 * Only accept that legacy representation when it matches this source relation;
 * a shared email must not connect another household member's search profile.
 */
export function acceptsSearcherEmailIdentity(
  sourceSystemId: string | null,
  sourceRelationCode: string | null,
  storedSystemId: unknown,
  storedRelationCode: unknown,
): boolean {
  const storedId = String(storedSystemId || "").trim();
  const storedCode = String(storedRelationCode || "").trim();
  if (!storedId) return !storedCode || !sourceRelationCode || storedCode === sourceRelationCode;
  if (sourceSystemId && storedId === sourceSystemId) return true;
  return Boolean(sourceRelationCode && storedId === sourceRelationCode && (!storedCode || storedCode === sourceRelationCode));
}
