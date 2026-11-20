"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeAction, type ActionResult } from "@/platform/action-result";
import { one, run } from "@/platform/db/client";
import { audit } from "@/platform/audit";
import { safeNext } from "./oauth";
import { passwordSchema } from "./password-policy";
import * as auth from "./service";
import { ActionError, endSession, requireMemberForAction, startSession } from "./session";

/** Client IP for rate limiting (first X-Forwarded-For hop set by the hosting proxy). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** SYS-02 email + password, with "Ghi nhớ đăng nhập". */
export async function loginAction(input: { email?: unknown; password?: unknown; remember?: unknown }, next?: string): Promise<ActionResult> {
  const res = await safeAction(async () => {
    const id = await auth.passwordLogin({ email: input.email, password: input.password }, await clientIp());
    await startSession(id, { remember: input.remember === true });
  });
  if (res.ok) redirect(safeNext(next));
  return res;
}

/** SYS-03. When email verification is required the member is not signed in yet. */
export async function registerAction(input: unknown, next?: string): Promise<ActionResult<{ mustVerify: boolean }>> {
  const res = await safeAction(async () => {
    const r = await auth.registerMember(input, await clientIp());
    if (!r.mustVerify) await startSession(r.id, { remember: true });
    return { mustVerify: r.mustVerify };
  });
  if (res.ok && !res.data.mustVerify) redirect(safeNext(next));
  return res;
}

export async function resendVerificationAction(email: string): Promise<ActionResult> {
  return safeAction(async () => {
    await auth.resendVerification(email, await clientIp());
    return undefined;
  });
}

/** SYS-06: verification is a POST from the page (link scanners that prefetch GETs cannot consume it). */
export async function verifyEmailAction(token: string): Promise<ActionResult> {
  return safeAction(async () => {
    await auth.verifyEmail(token);
    return undefined;
  });
}

/** SYS-04. Always the same answer, whether or not the email has an account. */
export async function forgotPasswordAction(email: string): Promise<ActionResult> {
  return safeAction(async () => {
    await auth.requestPasswordReset(email, await clientIp());
    return undefined;
  });
}

/** SYS-05. Signs out every device; the member logs in again with the new password. */
export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const res = await safeAction(async () => {
    await auth.resetPassword(input);
    await endSession();
  });
  if (res.ok) redirect("/login?reset=1");
  return res;
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Nhập mật khẩu hiện tại."), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Mật khẩu xác nhận không khớp." });

/** Changing the password signs out other devices and keeps this one signed in. */
export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requireMemberForAction();
    const data = changePasswordSchema.parse(input);
    const row = await one<{ password_hash: string }>("SELECT password_hash FROM members WHERE id = ?", [me.id]);
    if (row && !row.password_hash.startsWith("$2")) {
      throw new ActionError("Tài khoản đăng nhập bằng Google/Facebook chưa có mật khẩu. Dùng “Quên mật khẩu?” ở màn hình đăng nhập để tạo.");
    }
    if (!row || !(await bcrypt.compare(data.current, row.password_hash))) {
      await audit(me.id, "member.change_password", `member:${me.id}`, "failure");
      throw new ActionError("Mật khẩu hiện tại không đúng.");
    }
    await run("UPDATE members SET password_hash = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?", [
      await bcrypt.hash(data.next, 12),
      new Date().toISOString(),
      me.id,
    ]);
    await startSession(me.id, { remember: true });
    await audit(me.id, "member.change_password", `member:${me.id}`, "success");
    return undefined;
  });
}
