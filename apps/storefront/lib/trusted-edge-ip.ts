import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** Server-only: ingress must overwrite these headers and keep the token secret. */
export function trustedEdgeClientIP(
  headers: Headers,
  secret = process.env.EDGE_PROXY_SECRET,
): string | null {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return null;
  const supplied = headers.get("x-supastore-edge-token");
  if (!supplied) return null;
  const expected = Buffer.from(secret, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  const ip = headers.get("x-supastore-client-ip");
  if (
    !ip ||
    ip !== ip.trim() ||
    ip.includes(",") ||
    ip.includes("%") ||
    !isIP(ip)
  )
    return null;
  return ip;
}
