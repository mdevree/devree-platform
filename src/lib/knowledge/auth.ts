import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function knowledgeAccess(request: NextRequest, manage = false) {
  const supplied = request.headers.get("x-webhook-secret");
  const integrationSecret = process.env.RAG_INGEST_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (integrationSecret && supplied === integrationSecret) return { id: "integration", role: "integration" };
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as { id?: string; role?: string };
  if (manage && !["manager", "makelaar"].includes(user.role || "")) return null;
  return { id: user.id || null, role: user.role || "medewerker" };
}
