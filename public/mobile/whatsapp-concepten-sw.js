const draftsPath = "/mobile/whatsapp-concepten";
const draftIdPattern = /^(reply|followup)-[A-Za-z0-9_-]{1,120}$/;

function safeDraftId(value) {
  return typeof value === "string" && draftIdPattern.test(value) ? value : null;
}

self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data?.json();
  } catch {
    message = null;
  }
  const draft = safeDraftId(message?.draft);
  const body = typeof message?.body === "string" && message.body.trim()
    ? message.body.trim().slice(0, 180)
    : "Er staat een WhatsApp-concept klaar.";

  event.waitUntil(self.registration.showNotification(draft ? "Nieuw WhatsApp-concept" : "De Vree WhatsApp-concepten", {
    body,
    icon: "/whatsapp-app-icon.png",
    ...(draft ? { tag: draft } : {}),
    data: { draft, shownAt: Date.now() },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(draftsPath, self.location.origin);
  const draft = safeDraftId(event.notification.data?.draft);
  if (draft) target.searchParams.set("draft", draft);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      const url = new URL(client.url);
      return url.origin === target.origin && url.pathname === draftsPath;
    });
    if (existing) {
      try {
        const destination = existing.url === target.href ? existing : await existing.navigate(target.href);
        if (destination) return await destination.focus();
      } catch {
        // Open a new window if the existing one closed or could not navigate.
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
