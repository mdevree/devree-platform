import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createDebiteurenSharedLoginUrl,
  getDebiteurenPublicUrl,
} from "@/lib/debiteuren";

export async function GET(request: NextRequest) {
  const session = await auth();
  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";

  if (!session?.user?.id || !session.user.name) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  try {
    return NextResponse.redirect(createDebiteurenSharedLoginUrl({
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      returnTo,
    }));
  } catch {
    return NextResponse.redirect(getDebiteurenPublicUrl(returnTo));
  }
}
