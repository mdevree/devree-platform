type DraftRequest = (url: string, options: RequestInit) => Promise<unknown>;

export async function saveEditedFollowUpDraft(request: DraftRequest, id: string, body: string) {
  if (!body.trim()) throw new Error("Vul een bericht in voordat je het concept goedkeurt of verzendt.");
  return request(`/api/ai/follow-up-drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ body, status: "approved", reviewedBy: "platform" }),
  });
}

export async function sendEditedFollowUpDraft(request: DraftRequest, id: string, body: string) {
  // The send endpoint reads the stored draft, so persist the editor text first.
  await saveEditedFollowUpDraft(request, id, body);
  return request(`/api/ai/follow-up-drafts/${id}/send`, {
    method: "POST",
    body: JSON.stringify({ reviewedBy: "platform" }),
  });
}
