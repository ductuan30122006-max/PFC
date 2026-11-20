import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Store, Truck } from "lucide-react";
import { currentMember, toActor } from "@/platform/auth/session";
import { formatVnd } from "@/lib/money";
import { CATEGORIES, DELIVERY_LABEL, KIND_LABEL } from "@/modules/market/domain/orders";
import { getListing } from "@/modules/market/server/service";
import { ListingThumb } from "@/modules/market/ui/ListingCard";
import { AppHeader, Badge, ButtonLink, Card, Section } from "@/ui";
import { BuyBar } from "./BuyBar";

export const dynamic = "force-dynamic";

/** MKT-05 Product / MKT-06 Service / MKT-07 Course detail (mockup 59 / 128). */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentMember();
  const l = await getListing(me ? toActor(me) : null, id);
  if (!l) notFound();
  const soldOut = l.stock === 0;
  return (
    <>
      <AppHeader back backFallback="/market" title="Chi tiết sản phẩm" />
      <div className="px-4">
        {l.images.length > 1 ? (
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4" aria-label="Ảnh sản phẩm">
            {l.images.map((u, i) => (
              <li key={u} className="w-[85%] shrink-0 snap-center">
                <ListingThumb category={l.category} size="lg" image={u} alt={`${l.title} — ảnh ${i + 1}/${l.images.length}`} />
              </li>
            ))}
          </ul>
        ) : (
          <ListingThumb category={l.category} size="lg" image={l.images[0]} alt={l.title} />
        )}
        <h1 className="mt-4 text-[20px] leading-tight font-extrabold text-ink">{l.title}</h1>
        <p className="mt-1 text-[24px] font-extrabold text-primary">{l.price === 0 ? "Miễn phí" : formatVnd(l.price)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge>{KIND_LABEL[l.kind]}</Badge>
          <Badge tone="muted">{CATEGORIES[l.category]}</Badge>
          {soldOut ? <Badge tone="expense">Hết hàng</Badge> : l.stock !== null ? <Badge tone="income">Còn {l.stock}</Badge> : <Badge tone="income">Còn hàng</Badge>}
        </div>
        <p className="mt-3 flex items-center gap-4 text-[13px] text-muted">
          <span className="flex items-center gap-1">
            <Star size={14} className="fill-warning text-warning" /> {l.rating ?? "Chưa có"} ({l.reviewCount} đánh giá)
          </span>
          <span className="flex items-center gap-1">
            <Truck size={14} /> {DELIVERY_LABEL[l.delivery]}
          </span>
          <span>Đã bán {l.sold}</span>
        </p>
      </div>
      <Section>
        <Link href={`/market/shop/${l.sellerId}`} className="pressable flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
            <Store size={20} />
          </span>
          <span className="flex-1 text-[15px] font-semibold text-ink">{l.shopName}</span>
          <span className="text-[13px] font-semibold text-primary">Xem cửa hàng</span>
        </Link>
      </Section>
      <Section title="Mô tả">
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{l.description}</p>
      </Section>
      <Section title={`Đánh giá (${l.reviewCount})`}>
        {l.reviews.length === 0 ? (
          <p className="text-[14px] text-muted">Chưa có đánh giá. Chỉ người mua đã nhận hàng mới đánh giá được.</p>
        ) : (
          <ul className="space-y-3">
            {l.reviews.map((r) => (
              <li key={r.id}>
                <Card className="p-3">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                    {r.buyerName}
                    <span className="flex text-warning" aria-label={`${r.rating} sao`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} size={13} className={i < r.rating ? "fill-warning" : "text-line"} />
                      ))}
                    </span>
                  </p>
                  {r.comment && <p className="mt-1 text-[14px] text-ink-2">{r.comment}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {l.isOwner ? (
        <Section>
          <ButtonLink href={`/market/sell/listings/${l.id}`} variant="secondary" block>
            Quản lý tin đăng
          </ButtonLink>
        </Section>
      ) : (
        l.status === "published" && <BuyBar listingId={l.id} soldOut={soldOut} maxQty={l.stock ?? 99} favorite={l.favorite} signedIn={!!me} />
      )}
    </>
  );
}
