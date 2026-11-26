import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isWhatsAppDraftId, whatsappDraftLoginPath } from "@/lib/whatsappDraftLinks";
import WhatsAppDrafts from "./WhatsAppDrafts";

export const dynamic = "force-dynamic";

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
