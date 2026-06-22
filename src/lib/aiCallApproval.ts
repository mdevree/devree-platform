export function validateAiCallStartApproval(body: { humanApproved?: unknown; approvalText?: unknown }) {
  if (!body.humanApproved) {
    return "Menselijke goedkeuring is verplicht voordat de caller mag starten";
  }
  if (body.approvalText !== "BEL") {
    return "Typ exact BEL om deze AI-call bewust te starten";
  }
  return null;
}

export function buildAiCallApprovalNote(input: {
  currentReviewNotes?: string | null;
  reviewNotes?: unknown;
  reviewer: string;
  approvedAt?: Date;
}) {
  const noteBase = typeof input.reviewNotes === "string" && input.reviewNotes.trim()
    ? input.reviewNotes
    : input.currentReviewNotes || null;
  const approvedAt = input.approvedAt || new Date();
  return [
    noteBase,
    `AI-call handmatig goedgekeurd met bevestiging BEL door ${input.reviewer} op ${approvedAt.toISOString()}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAiCallBridgeApproval(input: {
  reviewer: string;
  starter?: string | null;
  approvedAt?: Date;
}) {
  const approvedAt = input.approvedAt || new Date();
  return {
    humanApproved: true,
    approvalText: "BEL",
    reviewedBy: input.reviewer,
    startedBy: input.starter || null,
    approvedAt: approvedAt.toISOString(),
  };
}
