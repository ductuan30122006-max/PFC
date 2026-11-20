import Link from "next/link";
import { BookOpen, Briefcase, Rocket, ShoppingBag, Users, Wallet, type LucideIcon } from "lucide-react";
import { HUBS, type HubSlug } from "@/domain/hubs";
import { InstallCard } from "@/platform/pwa/InstallCard";
import { AppHeader, Badge, Section } from "@/ui";

export const metadata = { title: "Trang chủ" };

const HUB_ICONS: Record<HubSlug, { icon: LucideIcon; tone: string }> = {
  finance: { icon: Wallet, tone: "bg-income-soft text-income" },
  learn: { icon: BookOpen, tone: "bg-primary-soft text-primary" },
  projects: { icon: Rocket, tone: "bg-primary-soft text-primary" },
  marketplace: { icon: ShoppingBag, tone: "bg-warning-soft text-warning" },
  opportunities: { icon: Briefcase, tone: "bg-expense-soft text-expense" },
  club: { icon: Users, tone: "bg-primary-soft text-primary" },
};

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <div className="px-4 pt-1">
        <p className="text-[15px] text-muted">Xin chào,</p>
        <h1 className="text-[24px] font-extrabold text-ink">Chào mừng đến PFC</h1>
        <p className="mt-1 text-[14px] text-ink-2">Small steps, big future.</p>
      </div>

      <Section>
        <InstallCard />
      </Section>

      <Section title="Khám phá">
        <ul className="grid grid-cols-2 gap-3">
          {HUBS.map((hub) => {
            const { icon: Icon, tone } = HUB_ICONS[hub.slug];
            return (
              <li key={hub.slug}>
                <Link
                  href={hub.href}
                  className="pressable flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card"
                >
                  <span className={`grid size-11 place-items-center rounded-2xl ${tone}`}>
                    <Icon size={22} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-ink">{hub.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted">{hub.subtitle}</span>
                  </span>
                  {!hub.ready && (
                    <span className="mt-auto self-start">
                      <Badge tone="muted">Sắp có · {hub.phase}</Badge>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
