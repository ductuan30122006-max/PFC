import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { verifyPlatformToken } from "@/domain/sso/platform-token";

/**
 * Platform session exchange (PFC App gateway → Opportunity Hub).
 * Verifies a short-lived HS256 token from PFC App, finds the member by email (or creates a
 * MEMBER — never PROVIDER/REVIEWER; those stay assigned inside Opportunity Hub), then sets
 * the Opportunity session cookie. Replaces the separate login (directory.ts note).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.OPP_SSO_SHARED_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Platform SSO is not configured" }, { status: 503 });
  if (!rateLimit(`sso:${req.headers.get("x-forwarded-for") ?? "local"}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { id_token?: unknown } | null;
  const claims = verifyPlatformToken(typeof body?.id_token === "string" ? body.id_token : "", secret, Math.floor(Date.now() / 1000));
  if (!claims) return NextResponse.json({ error: "Invalid platform token" }, { status: 401 });

  const member =
    (await prisma.member.findUnique({ where: { email: claims.email } })) ??
    (await prisma.member.create({
      data: {
        email: claims.email,
        name: claims.name,
        role: "MEMBER",
        // Unusable password: platform users sign in through PFC App only.
        passwordHash: hashPassword(randomBytes(32).toString("hex")),
      },
    }));

  await createSession(member.id);
  return NextResponse.json({ id: member.id, role: member.role });
}
