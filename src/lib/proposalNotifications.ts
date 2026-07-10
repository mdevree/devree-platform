function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ProposalNotificationProject = {
  id: string;
  name: string;
  type?: string;
  woningAdres: string | null;
  woningPostcode: string | null;
  woningPlaats: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export async function notifyOfficeProposalFirstViewed({
  project,
  proposalUrl,
  viewedAt,
}: {
  project: ProposalNotificationProject;
  proposalUrl: string | null;
  viewedAt: Date;
}) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  const platformUrl = (process.env.PLATFORM_BASE_URL || "https://kantoor.devreemakelaardij.nl").replace(/\/$/, "");
  const objectAdres = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ") || project.name;
  const viewedAtLabel = viewedAt.toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = `
    <h2>Voorstel geopend</h2>
    <p>De voorstelpagina is voor het eerst geopend.</p>
    <p>
      <strong>Project:</strong> ${escapeHtml(project.name)}<br>
      <strong>Object:</strong> ${escapeHtml(objectAdres)}<br>
      <strong>Geopend op:</strong> ${escapeHtml(viewedAtLabel)}<br>
      <strong>Contact:</strong> ${escapeHtml(project.contactName || "Onbekend")}<br>
      <strong>E-mail:</strong> ${escapeHtml(project.contactEmail || "")}<br>
      <strong>Telefoon:</strong> ${escapeHtml(project.contactPhone || "")}
    </p>
    <p>
      <a href="${escapeHtml(`${platformUrl}/projecten/${project.id}`)}">Open project in kantoorplatform</a>
      ${proposalUrl ? `<br><a href="${escapeHtml(proposalUrl)}">Open voorstelpagina</a>` : ""}
    </p>
  `;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject: project.type === "AANKOOP" ? `Voorstel aankoop geopend: ${objectAdres}` : `Voorstel geopend: ${objectAdres}`,
      html,
    }),
  }).catch((error) => {
    console.error("Voorstel geopend mail mislukt:", error);
  });
}
