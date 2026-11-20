import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one } from "@/platform/db/client";
import { ActionError as ActionErrorImpl } from "@/platform/errors";
import { isDepartment, isRole, type Actor, type Department, type Role } from "@/platform/roles";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, verifySessionToken } from "./session-token";

export type Member = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  role: Role;
  department: Department | null;
};

/** Hub session cookies minted by the gateway for the signed-in PFC member (ADR-011). */
export const HUB_COOKIES = ["pfc_club_session", "pfc_opp_session", "pfc_club_session_owner", "pfc_opp_session_owner"] as const;

export function toActor(m: Member): Actor {
  return { id: m.id, role: m.role, department: m.department };
}

function secret(): string {
  const s = process.env.PFC_SESSION_SECRET ?? "";
  if (!s) throw new Error("PFC_SESSION_SECRET is not set (see .env.example)");
  return s;
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function startSession(memberId: string): Promise<void> {
  const jar = await cookies();
  // A new PFC identity must never inherit hub sessions of the previous one.
  for (const c of HUB_COOKIES) jar.delete(c);
  jar.set(SESSION_COOKIE, createSessionToken(memberId, secret(), nowSec()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.PFC_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  for (const c of HUB_COOKIES) jar.delete(c);
}

/** Current member or null. Role/identity always re-read from the DB, never trusted from the cookie. */
export async function currentMember(): Promise<Member | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token, secret(), nowSec());
  if (!payload) return null;
  return memberById(payload.sub);
}

/** Loads a member; locked accounts count as signed out everywhere. */
export async function memberById(id: string): Promise<Member | null> {
  const row = await one<{ id: string; email: string; full_name: string; created_at: string; role: string; department: string | null; locked: number }>(
    "SELECT id, email, full_name, created_at, role, department, locked FROM members WHERE id = ?",
    [id],
  );
  if (!row || Number(row.locked) === 1) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    createdAt: row.created_at,
    role: isRole(row.role) ? row.role : "thanh_vien",
    department: isDepartment(row.department) ? row.department : null,
  };
}

/** For pages: redirect to login (and come back afterwards) when not signed in. */
export async function requireMember(returnTo: string): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return m;
}

/** For server actions: throw instead of redirecting mid-mutation. */
export async function requireMemberForAction(): Promise<Member> {
  const m = await currentMember();
  if (!m) throw new ActionErrorImpl("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  return m;
}

export { ActionError } from "@/platform/errors";
