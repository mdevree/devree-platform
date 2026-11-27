import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isWhatsAppDraftId, whatsappDraftLoginPath } from "@/lib/whatsappDraftLinks";
import WhatsAppDrafts from "./WhatsAppDrafts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "WhatsApp-concepten · De Vree",
  manifest: "/whatsapp-concepten.webmanifest",
  icons: { apple: "/whatsapp-app-icon.png" },
  appleWebApp: { capable: true, title: "De Vree Concepten" },
};
export const viewport: Viewport = { themeColor: "#03543d" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { draft } = await searchParams;
  const draftId = typeof draft === "string" && isWhatsAppDraftId(draft) ? draft : undefined;
  const session = await auth();
  if (!session?.user?.id) redirect(whatsappDraftLoginPath(draftId));
  return <WhatsAppDrafts key={draftId ?? "list"} draftId={draftId} />;
}
