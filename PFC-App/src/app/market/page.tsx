import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { CATEGORIES } from "@/modules/market/domain/orders";
import { listPublished } from "@/modules/market/server/service";
import { CATEGORY_ICON, ListingCard } from "@/modules/market/ui/ListingCard";
import { AppHeader, EmptyState } from "@/ui";
import { FilterChips } from "@/ui/FilterChips";
import { SearchBox } from "@/ui/SearchBox";
import { cx } from "@/ui/cx";

export const dynamic = "force-dynamic";

/** MKT-01 Home · MKT-02 Listing · MKT-03 Category · MKT-04 Search (mockup 58 / 127). */
export default async function MarketHome({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string }> }) {
  const { q, category, sort } = await searchParams;
  const items = await listPublished({ q: q?.slice(0, 80), category, sort });
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, category, sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/market?${p.toString()}`;
  };
  return (
    <>
      <AppHeader backHref="/home" title="Marketplace" subtitle="Sản phẩm & dịch vụ cho hành trình phát triển của bạn" />
      <div className="space-y-3 px-4">
        <SearchBox placeholder="Tìm sản phẩm, dịch vụ, khóa học…" />
        <nav aria-label="Danh mục" className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {[["", "Tất cả"] as const, ...Object.entries(CATEGORIES)].map(([key, label]) => {
            const Icon = CATEGORY_ICON[key] ?? ShoppingBag;
            const active = (category ?? "") === key;
            return (
              <Link key={key || "all"} href={qs({ category: key || undefined })} scroll={false} className="pressable flex w-16 shrink-0 flex-col items-center gap-1.5 text-center text-[11px] font-semibold text-ink-2">
                <span className={cx("grid size-12 place-items-center rounded-2xl", active ? "bg-primary text-on-primary" : "bg-primary-soft text-primary")}>
                  <Icon size={22} />
                </span>
                <span className="line-clamp-2">{label}</span>
              </Link>
            );
          })}
        </nav>
        <FilterChips
          label="Sắp xếp"
          value={sort === "price_asc" || sort === "price_desc" ? sort : "newest"}
          hrefFor={(s) => qs({ sort: s === "newest" ? undefined : s })}
          options={[
            { value: "newest", label: "Mới nhất" },
            { value: "price_asc", label: "Giá thấp → cao" },
            { value: "price_desc", label: "Giá cao → thấp" },
          ]}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="Chưa có sản phẩm phù hợp" description="Thử danh mục hoặc từ khóa khác. Bạn cũng có thể mở cửa hàng trong mục Bán hàng." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 px-4 pt-3">
          {items.map((l) => (
            <li key={l.id}>
              <ListingCard l={l} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
