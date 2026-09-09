/** A planner block groups viewings and does not identify an individual visitor. */
export function isExpectedMissingAgendaContact(item: {
  agtype: string | null;
  agrcode: string | null;
  relationRelationid: string | null;
  enrichmentStatus: string | null;
}): boolean {
  return item.enrichmentStatus === "no_contact"
    && /bezichtigingsblok/i.test(item.agtype ?? "")
    && !item.agrcode?.trim()
    && !item.relationRelationid?.trim();
}

/** Keep audit events intact; only remove alerts whose exact quarantine was handled. */
export function isHandledQuarantineEvent(
  event: { status: string; payloadHash: string | null },
  handledHashes: ReadonlySet<string>,
): boolean {
  if (event.status !== "quarantined" || !event.payloadHash?.endsWith(":quarantine")) return false;
  return handledHashes.has(event.payloadHash.slice(0, -":quarantine".length));
}
