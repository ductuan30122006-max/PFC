import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, OAUTH_ENDPOINTS, isProvider, normaliseProfile, openState, providerConfig, stateMatches, type Provider, type ProviderConfig } from "@/platform/auth/oauth";
import { socialSignIn } from "@/platform/auth/service";
import { startSession } from "@/platform/auth/session";
import { ActionError } from "@/platform/errors";
import { publicUrl } from "@/platform/mail";

export const dynamic = "force-dynamic";

async function exchange(p: Provider, cfg: ProviderConfig, code: string, verifier: string): Promise<string | null> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_ENDPOINTS[p].token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: unknown };
  return typeof json.access_token === "string" ? json.access_token : null;
}

async function fetchProfile(p: Provider, cfg: ProviderConfig, accessToken: string): Promise<unknown> {
  const url = new URL(OAUTH_ENDPOINTS[p].profile);
  const init: RequestInit = { cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } };
  if (p === "google") {
    init.headers = { accept: "application/json", authorization: `Bearer ${accessToken}` };
  } else {
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("appsecret_proof", createHmac("sha256", cfg.clientSecret).update(accessToken).digest("hex"));
  }
  const res = await fetch(url, init);
  return res.ok ? res.json() : null;
}

/** Provider redirects here with ?code&state. Everything is verified server-side before a session starts. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const fail = (code: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
    r.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/oauth", maxAge: 0 });
    return r;
  };
  if (!isProvider(provider)) return fail("oauth_invalid");
  const cfg = providerConfig(provider, process.env, publicUrl());
  if (!cfg) return fail("oauth_unconfigured");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail("oauth_cancelled");

  const sealed = openState(req.cookies.get(OAUTH_COOKIE)?.value, process.env.PFC_SESSION_SECRET ?? "", Math.floor(Date.now() / 1000));
  const code = q.get("code");
  if (!sealed || sealed.p !== provider || !stateMatches(sealed.state, q.get("state")) || !code) return fail("oauth_state");

  try {
    const token = await exchange(provider, cfg, code, sealed.verifier);
    if (!token) return fail("oauth_failed");
    const profile = normaliseProfile(provider, await fetchProfile(provider, cfg, token));
    if (!profile) return fail("oauth_failed");
    const memberId = await socialSignIn(profile);
    await startSession(memberId, { remember: sealed.remember });
    const r = NextResponse.redirect(new URL(sealed.next, req.url));
    r.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/oauth", maxAge: 0 });
    return r;
  } catch (err) {
    if (err instanceof ActionError && err.code) return fail(err.code);
    console.error("[oauth]", provider, err);
    return fail("oauth_failed");
  }
}
