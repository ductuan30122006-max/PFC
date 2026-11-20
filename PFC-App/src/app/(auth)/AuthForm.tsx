"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useState, useTransition } from "react";
import { loginAction, registerAction } from "@/platform/auth/actions";
import { PASSWORD_RULES } from "@/platform/auth/password-policy";
import { Button } from "@/ui";
import { FormError, PasswordInput, TextInput } from "@/ui/Form";
import { cx } from "@/ui/cx";

/** SYS-02 Login / SYS-03 Register (mockups 2–3, 95–96). */
export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const register = mode === "register";
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = register
          ? await registerAction({ fullName, email, password, agree }, next)
          : await loginAction({ email, password }, next);
        if (res && !res.ok) setError(res.error);
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err) throw err; // redirect on success
        setError("Không kết nối được máy chủ. Kiểm tra mạng và thử lại.");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
      <Link href="/home" className="mx-auto mb-6 flex items-center gap-2" aria-label="Về trang chủ PFC">
        <Image src="/brand/pfc-mark.png" alt="" width={44} height={44} className="rounded-xl" priority />
        <span className="text-2xl font-extrabold text-primary">PFC</span>
      </Link>
      <h1 className="text-center text-[26px] font-extrabold text-ink">{register ? "Tạo tài khoản" : "Chào mừng trở lại!"}</h1>
      <p className="mt-1 mb-6 text-center text-[15px] text-muted">
        {register ? "Tham gia cộng đồng PFC ngay hôm nay" : "Đăng nhập để tiếp tục hành trình tài chính của bạn"}
      </p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {register && (
          <TextInput label="Họ và tên" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
        )}
        <TextInput
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordInput
          label="Mật khẩu"
          autoComplete={register ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {register && (
          <>
            <ul className="space-y-1 text-[13px]">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(password);
                return (
                  <li key={r.id} className={cx("flex items-center gap-2", ok ? "text-income" : "text-muted")}>
                    {ok ? <Check size={15} /> : <Circle size={15} />} {r.label}
                  </li>
                );
              })}
            </ul>
            <label className="flex items-start gap-3 text-[14px] text-ink-2">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--pfc-primary)]"
              />
              <span>Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của PFC.</span>
            </label>
          </>
        )}
        <FormError message={error} />
        <Button type="submit" block disabled={pending}>
          {pending ? "Đang xử lý…" : register ? "Tạo tài khoản" : "Đăng nhập"}
        </Button>
      </form>

      <p className="mt-auto pt-8 text-center text-[14px] text-muted">
        {register ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        <Link href={`${register ? "/login" : "/register"}${nextQuery}`} className="font-semibold text-primary">
          {register ? "Đăng nhập" : "Đăng ký ngay"}
        </Link>
      </p>
    </div>
  );
}
