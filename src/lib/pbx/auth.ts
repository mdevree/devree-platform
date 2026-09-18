import { timingSafeEqual } from "node:crypto";
export function pbxServiceAuthorized(req: Request) {
  const secret = process.env.PBX_SERVICE_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || secret.length < 32 || !given) return false;
  const a = Buffer.from(secret), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
