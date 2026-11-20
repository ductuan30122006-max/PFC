"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeAction, type ActionResult } from "@/platform/action-result";
import { one, run } from "@/platform/db/client";
import { audit } from "@/platform/audit";
import { allowAttempt } from "@/platform/rate-limit";
import { ActionError, endSession, requireMemberForAction, startSession } from "./session";
import { passwordSchema } from "./password-policy";

const emailSchema = z.string().trim().toLowerCase().email("Email không hợp lệ.").max(254);

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Vui lòng nhập họ và tên.").max(80),
  email: emailSchema,
  password: passwordSchema,
  agree: z.literal(true, { errorMap: () => ({ message: "Bạn cần đồng ý Điều khoản và Chính sách bảo mật." }) }),
});

/** Only allow same-site relative paths as post-login destinations (no open redirect). */
function safeNext(next: unknown): string {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/home";
}

export async function registerAction(input: unknown, next?: string): Promise<ActionResult> {
  const res = await safeAction(async () => {
    const data = registerSchema.parse(input);
    if (!allowAttempt(`register:${data.email}`, 5, 15 * 60_000)) {
      throw new ActionError("Bạn thử quá nhiều lần. Vui lòng đợi ít phút.");
    }
    const exists = await one("SELECT id FROM members WHERE email = ?", [data.email]);
    if (exists) throw new ActionError("Email này đã được đăng ký. Hãy đăng nhập.");
    const id = randomUUID();
    const now = new Date().toISOString();
    // Bootstrap: emails in PFC_OWNER_EMAILS become Chủ nhiệm; everyone else starts as Thành viên.
    const owners = (process.env.PFC_OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const role = owners.includes(data.email) ? "chu_nhiem" : "thanh_vien";
    await run(
      "INSERT INTO members (id, email, full_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.email, data.fullName, await bcrypt.hash(data.password, 12), role, now, now],
    );
    await audit(id, "member.register", `member:${id}`, "success");
    await startSession(id);
  });
  if (res.ok) redirect(safeNext(next));
  return res;
}

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Vui lòng nhập mật khẩu.").max(200) });

export async function loginAction(input: unknown, next?: string): Promise<ActionResult> {
  const res = await safeAction(async () => {
    const data = loginSchema.parse(input);
    if (!allowAttempt(`login:${data.email}`, 8, 15 * 60_000)) {
      throw new ActionError("Bạn đăng nhập sai quá nhiều lần. Vui lòng đợi 15 phút.");
    }
    const row = await one<{ id: string; password_hash: string; locked: number }>(
      "SELECT id, password_hash, locked FROM members WHERE email = ?",
      [data.email],
    );
    // Same message whether the email exists or not (no account enumeration).
    const ok = row ? await bcrypt.compare(data.password, row.password_hash) : false;
    if (!row || !ok) {
      await audit(row?.id ?? null, "member.login", `email:${data.email}`, "failure");
      throw new ActionError("Email hoặc mật khẩu không đúng.");
    }
    if (Number(row.locked) === 1) {
      await audit(row.id, "member.login", `member:${row.id}`, "failure");
      throw new ActionError("Tài khoản đã bị khóa. Liên hệ Chủ nhiệm PFC.");
    }
    await audit(row.id, "member.login", `member:${row.id}`, "success");
    await startSession(row.id);
  });
  if (res.ok) redirect(safeNext(next));
  return res;
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Nhập mật khẩu hiện tại."), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "Mật khẩu xác nhận không khớp." });

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requireMemberForAction();
    const data = changePasswordSchema.parse(input);
    const row = await one<{ password_hash: string }>("SELECT password_hash FROM members WHERE id = ?", [me.id]);
    if (!row || !(await bcrypt.compare(data.current, row.password_hash))) {
      await audit(me.id, "member.change_password", `member:${me.id}`, "failure");
      throw new ActionError("Mật khẩu hiện tại không đúng.");
    }
    await run("UPDATE members SET password_hash = ?, updated_at = ? WHERE id = ?", [
      await bcrypt.hash(data.next, 12),
      new Date().toISOString(),
      me.id,
    ]);
    await audit(me.id, "member.change_password", `member:${me.id}`, "success");
    return undefined;
  });
}
