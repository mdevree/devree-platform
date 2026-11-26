import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { draftReviewPath, validDraftId } from "@/lib/listingSearch";

export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!validDraftId(id)) return new Response("Ongeldig concept", {status: 404});
  redirect((await auth()) ? draftReviewPath(id) : "/login?concept=" + id);
}
