import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember, toActor } from "@/platform/auth/session";
import { formatVnd } from "@/lib/money";
import { ORDER_STATUS_LABEL, ORDER_TONE, PAYMENT_LABEL, type OrderStatus } from "@/modules/market/domain/orders";
import { getOrder } from "@/modules/market/server/service";
import { AppHeader, Badge, Card, Section } from "@/ui";
import { cx } from "@/ui/cx";
import { OrderActions, ReviewButton } from "./OrderClient";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { ...ORDER_STATUS_LABEL, paid: "Người bán xác nhận đã nhận tiền" };

/** MKT-17 Order Detail / SELL-11 Seller Order Detail (mockup 66). Visible to buyer and seller only. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember(`/market/orders/${id}`);
  const o = await getOrder(toActor(me), id);
  if (!o) notFound();
  return (
    <>
      <AppHeader back backFallback={o.role === "buyer" ? "/market/orders" : "/market/sell/orders"} title="Chi tiết đơn hàng" />
      <div className="px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px] font-extrabold text-ink">#{o.code}</p>
          <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
        </div>
        <p className="text-[13px] text-muted">{new Date(o.createdAt).toLocaleString("vi-VN")}</p>
      </div>
      <Section title="Sản phẩm">
        <Card className="space-y-3">
          {o.items.map((i) => (
            <div key={i.listingId} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/market/p/${i.listingId}`} className="text-[14px] font-semibold text-ink">
                  {i.title}
                </Link>
                <p className="text-[13px] text-muted">
                  {formatVnd(i.unitPrice)} × {i.qty}
                </p>
              </div>
              {o.canReview && !i.reviewed && <ReviewButton orderId={o.id} listingId={i.listingId} title={i.title} />}
              {i.reviewed && <Badge tone="income">Đã đánh giá</Badge>}
            </div>
          ))}
          <p className="flex justify-between border-t border-line pt-2 text-[15px]">
            <span className="text-ink-2">Tổng cộng</span>
            <b className="text-primary">{formatVnd(o.total)}</b>
          </p>
        </Card>
      </Section>
      <Section title="Thanh toán & giao nhận">
        <dl className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface text-[14px]">
          {[
            ["Phương thức", PAYMENT_LABEL[o.paymentMethod]],
            ["Thanh toán", o.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán"],
            [o.role === "buyer" ? "Người bán" : "Người mua", o.role === "buyer" ? o.shopName : o.buyerName],
            ...(o.role === "buyer" && o.sellerContact ? [["Liên hệ người bán", o.sellerContact]] : []),
            ["Người nhận", `${o.recipientName} · ${o.recipientPhone}`],
            ...(o.address ? [["Địa chỉ", o.address]] : []),
            ...(o.note ? [["Ghi chú", o.note]] : []),
            ...(o.cancelReason ? [["Lý do hủy", o.cancelReason]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="text-right font-medium break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {o.actions.length > 0 && (
        <Section>
          <OrderActions orderId={o.id} actions={o.actions} role={o.role} paymentMethod={o.paymentMethod} />
        </Section>
      )}
      <Section title="Lịch sử đơn hàng">
        <ol className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
          {o.events.map((e, i) => (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              <span className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", i === o.events.length - 1 ? "bg-primary" : "bg-line")} />
              <span>
                <span className="block text-[14px] font-semibold text-ink">{EVENT_LABEL[e.status as OrderStatus] ?? e.status}</span>
                <span className="block text-[12px] text-muted">
                  {new Date(e.at).toLocaleString("vi-VN")}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
