import Link from "next/link";
import { Clock, Plus, ReceiptText, Store } from "lucide-react";
import { requireMember, toActor } from "@/platform/auth/session";
import { formatVnd } from "@/lib/money";
import { STATUS_LABEL, STATUS_TONE } from "@/platform/workflow";
import { getSeller, myListings, sellerStats } from "@/modules/market/server/service";
import { AppHeader, Badge, ButtonLink, Card, EmptyState, ListGroup, ListItem, Section } from "@/ui";
import { SellerRegistration } from "./SellerRegistration";

export const metadata = { title: "Bán hàng" };
export const dynamic = "force-dynamic";

/** SELL-01 Seller Dashboard · SELL-02 Registration · SELL-04 Product Management · SELL-12 Revenue. */
export default async function SellPage() {
  const me = await requireMember("/market/sell");
  const actor = toActor(me);
  const seller = await getSeller(me.id);

  if (!seller || seller.status === "rejected") {
    return (
      <>
        <AppHeader title="Bán hàng" backHref="/market" />
        {seller?.status === "rejected" && (
          <Section>
            <Card className="border-expense bg-expense-soft text-[14px] text-expense">Hồ sơ trước bị từ chối: {seller.rejectReason}. Bạn có thể cập nhật và gửi lại.</Card>
          </Section>
        )}
        <SellerRegistration initial={seller ? { shopName: seller.shopName, bio: seller.bio, contact: seller.contact } : undefined} />
      </>
    );
  }
  if (seller.status === "pending") {
    return (
      <>
        <AppHeader title="Bán hàng" backHref="/market" />
        <EmptyState icon={Clock} title="Hồ sơ người bán đang chờ duyệt" description="Chủ nhiệm hoặc Ban điều hành sẽ duyệt sớm. Sau khi được duyệt, bạn có thể đăng sản phẩm." />
      </>
    );
  }
  if (seller.status === "suspended") {
    return (
      <>
        <AppHeader title="Bán hàng" backHref="/market" />
        <EmptyState icon={Store} title="Cửa hàng đang bị tạm ngưng" description={seller.rejectReason ?? "Liên hệ Ban điều hành để biết thêm."} />
      </>
    );
  }

  const [stats, listings] = await Promise.all([sellerStats(actor), myListings(actor)]);
  return (
    <>
      <AppHeader
        title={seller.shopName}
        backHref="/market"
        subtitle="Kênh người bán"
      />
      <Section>
        <div className="grid grid-cols-2 gap-3">
          <Card className="col-span-2 bg-primary text-on-primary">
            <p className="text-[13px] opacity-90">Doanh thu (đơn hoàn tất)</p>
            <p className="text-[24px] font-extrabold">{formatVnd(stats.revenue)}</p>
            <p className="text-[12px] opacity-90">{stats.completed} đơn hoàn tất · đánh giá {stats.rating ?? "—"}★</p>
          </Card>
          <Card className="p-3.5">
            <p className="text-[22px] font-extrabold text-ink">{stats.open}</p>
            <p className="text-[12px] text-muted">Đơn cần xử lý</p>
          </Card>
          <Card className="p-3.5">
            <p className="text-[22px] font-extrabold text-ink">{stats.listings}</p>
            <p className="text-[12px] text-muted">Sản phẩm đang bán</p>
          </Card>
        </div>
      </Section>
      <Section>
        <ListGroup>
          <ListItem icon={ReceiptText} title="Đơn bán" description="Xác nhận, giao hàng, hủy" href="/market/sell/orders" trailing={stats.open > 0 ? <Badge tone="warning">{stats.open}</Badge> : undefined} />
          <ListItem icon={Store} title="Hồ sơ cửa hàng" description="Tên, giới thiệu, liên hệ" href="/market/sell/profile" />
        </ListGroup>
      </Section>
      <Section
        title={`Tin đăng (${listings.length})`}
        action={
          <Link href="/market/sell/listings/new" className="flex items-center gap-1 text-[14px] font-semibold text-primary">
            <Plus size={16} /> Đăng tin
          </Link>
        }
      >
        {listings.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Chưa có tin đăng"
            action={
              <ButtonLink href="/market/sell/listings/new" block>
                Đăng tin đầu tiên
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/market/sell/listings/${l.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{l.title}</span>
                    <span className="block text-[12px] text-muted">
                      {formatVnd(l.price)} · {l.stock === null ? "không giới hạn" : `kho ${l.stock}`} · đã bán {l.sold}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
