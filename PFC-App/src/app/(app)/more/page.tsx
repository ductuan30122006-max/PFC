import Link from "next/link";
import { Bell, Info, KeyRound, Languages, LayoutGrid, LogOut, Palette, ShieldCheck, UserCog, UserRound } from "lucide-react";
import { DEPARTMENT_LABEL, ROLE_LABEL, can } from "@/platform/roles";
import { toActor } from "@/platform/auth/session";
import { logoutAction } from "@/platform/auth/actions";
import { currentMember } from "@/platform/auth/session";
import { InstallCard } from "@/platform/pwa/InstallCard";
import { AppHeader, Badge, ButtonLink, ListGroup, ListItem, Section } from "@/ui";

export const metadata = { title: "Thêm" };

/** SYS-12 Profile / SYS-14 Settings entry (mockup 12 / 87). */
export default async function MorePage() {
  const me = await currentMember();
  const initials = me?.fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <>
      <AppHeader title="Thêm" />
      <Section>
        {me ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-[18px] font-bold text-on-primary">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold text-ink">{me.fullName}</p>
              <p className="truncate text-[13px] text-muted">{me.email}</p>
              <p className="text-[12px] font-semibold text-primary">
                {ROLE_LABEL[me.role]}
                {me.department ? ` · ${DEPARTMENT_LABEL[me.department]}` : ""}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
                <UserRound size={28} />
              </span>
              <div>
                <p className="text-[16px] font-bold text-ink">Chưa đăng nhập</p>
                <p className="text-[13px] text-muted">Một tài khoản PFC cho mọi nhánh.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ButtonLink href="/login?next=/more">Đăng nhập</ButtonLink>
              <ButtonLink href="/register?next=/more" variant="secondary">
                Đăng ký
              </ButtonLink>
            </div>
          </div>
        )}
      </Section>

      <Section>
        <InstallCard />
      </Section>

      <Section>
        <ListGroup label="Cài đặt">
          <ListItem icon={Palette} title="Giao diện" description="Sáng, tối hoặc theo thiết bị" href="/more/appearance" />
          <ListItem icon={Languages} title="Ngôn ngữ" description="Tiếng Việt" disabled />
          <ListItem icon={Bell} title="Thông báo" description="Thông báo đẩy trên điện thoại" trailing={<Badge tone="muted">P5</Badge>} disabled />
          {me && <ListItem icon={KeyRound} title="Đổi mật khẩu" href="/more/password" />}
          <ListItem icon={ShieldCheck} title="Phân quyền" description="Ai được làm gì trong PFC" href="/more/roles" />
          {me && can(toActor(me), "admin.members.view") && (
            <ListItem icon={UserCog} title="Quản lý tài khoản" description="Vai trò, khóa tài khoản" href="/more/admin" />
          )}
        </ListGroup>
      </Section>

      <Section>
        <ListGroup label="Khác">
          <ListItem icon={LayoutGrid} title="Bộ giao diện (UI kit)" description="Các thành phần dùng chung" href="/more/ui-kit" />
          <ListItem icon={Info} title="Về ứng dụng" href="/more/about" />
        </ListGroup>
      </Section>

      {me && (
        <Section>
          <form action={logoutAction}>
            <button
              type="submit"
              className="pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-expense-soft text-[15px] font-semibold text-expense"
            >
              <LogOut size={18} /> Đăng xuất
            </button>
          </form>
          <p className="mt-3 text-center text-[12px] text-muted">
            Đăng xuất khỏi PFC và mọi nhánh (Câu lạc bộ, Cơ hội…).
          </p>
        </Section>
      )}
    </>
  );
}
