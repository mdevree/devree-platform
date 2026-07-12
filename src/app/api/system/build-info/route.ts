import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const commitSha = clean(process.env.APP_COMMIT_SHA);
  const imageTag = clean(process.env.APP_IMAGE_TAG);

  return NextResponse.json({
    commitSha,
    shortCommitSha: commitSha?.slice(0, 7) || null,
    buildTime: clean(process.env.APP_BUILD_TIME),
    imageTag,
    nodeEnv: clean(process.env.NODE_ENV),
  });
}
