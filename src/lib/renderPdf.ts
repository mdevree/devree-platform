const DEFAULT_GOTENBERG_URL = "http://127.0.0.1:3050";

export async function renderPdf(
  html: string,
  waitForExpression?: string,
): Promise<Buffer> {
  const gotenbergUrl = (
    process.env.GOTENBERG_URL || DEFAULT_GOTENBERG_URL
  ).replace(/\/$/, "");
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  form.append("preferCssPageSize", "true");

  if (waitForExpression) form.append("waitForExpression", waitForExpression);

  const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(
      `Gotenberg PDF-generatie mislukt (${res.status}): ${await res.text()}`,
    );
  }

  return Buffer.from(await res.arrayBuffer());
}
