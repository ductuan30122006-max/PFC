import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed session token: base64url(payload).base64url(HMAC-SHA256).
 * Pure (secret passed in) so it can be unit tested. Same scheme as Club CM-104.
 */
export type SessionPayload = { sub: string; exp: number };

export const SESSION_COOKIE = "pfc_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(memberId: string, secret: string, nowSec: number, ttl = SESSION_TTL_SECONDS): string {
  if (!secret) throw new Error("PFC_SESSION_SECRET is not set");
  const payload = Buffer.from(JSON.stringify({ sub: memberId, exp: nowSec + ttl })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, nowSec: number): SessionPayload | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (typeof body.sub !== "string" || typeof body.exp !== "number" || body.exp <= nowSec) return null;
    return body;
  } catch {
    return null;
  }
}
