import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { all, one, run, withTransaction } from "@/platform/db/client";
import { audit } from "@/platform/audit";
import { ActionError } from "@/platform/errors";
import { can, type Actor } from "@/platform/roles";
import { applyWorkflow, canEditContent, canViewContent, isContentStatus, type ContentStatus, type WorkflowAction } from "@/platform/workflow";
import { MAX_AMOUNT_VND } from "@/lib/money";
import {
  CATEGORIES,
  applyOrderAction,
  availableActions,
  averageRating,
  canReview,
  cartProblems,
  orderCode,
  splitCart,
  type CartLine,
  type OrderAction,
  type OrderStatus,
  type PaymentMethod,
} from "../domain/orders";

/** Marketplace use-cases (FR-MKT). Actor-based; every permission is checked here. */
const now = () => new Date().toISOString();
const statusOf = (s: unknown): ContentStatus => (isContentStatus(s) ? s : "draft");
const likeArg = (q: string) => `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

// ───────────────────────── Sellers ─────────────────────────

export type SellerStatus = "pending" | "approved" | "rejected" | "suspended";
export type Seller = { memberId: string; shopName: string; bio: string; contact: string; status: SellerStatus; rejectReason: string | null; memberName: string };

export async function getSeller(memberId: string): Promise<Seller | null> {
  const r = await one<{ member_id: string; shop_name: string; bio: string; contact: string; status: SellerStatus; reject_reason: string | null; full_name: string }>(
    "SELECT s.*, m.full_name FROM mkt_sellers s JOIN members m ON m.id = s.member_id WHERE s.member_id = ?",
    [memberId],
  );
  return r ? { memberId: r.member_id, shopName: r.shop_name, bio: r.bio, contact: r.contact, status: r.status, rejectReason: r.reject_reason, memberName: r.full_name } : null;
}

const sellerSchema = z.object({
  shopName: z.string().trim().min(2, "Tên cửa hàng tối thiểu 2 ký tự.").max(60),
  bio: z.string().trim().max(500).default(""),
  contact: z.string().trim().min(5, "Nhập cách liên hệ (Zalo/điện thoại/email) để người mua trao đổi.").max(120),
});

/** SELL-02 Seller Registration. Staff with seller-approval rights are approved immediately. */
export async function registerSeller(actor: Actor, input: unknown): Promise<SellerStatus> {
  const d = sellerSchema.parse(input);
  const existing = await getSeller(actor.id);
  if (existing?.status === "approved" || existing?.status === "suspended") {
    await run("UPDATE mkt_sellers SET shop_name = ?, bio = ?, contact = ?, updated_at = ? WHERE member_id = ?", [d.shopName, d.bio, d.contact, now(), actor.id]);
    return existing.status;
  }
  const status: SellerStatus = can(actor, "mkt.seller.approve") ? "approved" : "pending";
  await run(
    `INSERT INTO mkt_sellers (member_id, shop_name, bio, contact, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (member_id) DO UPDATE SET shop_name = excluded.shop_name, bio = excluded.bio, contact = excluded.contact, status = excluded.status, reject_reason = NULL, updated_at = excluded.updated_at`,
    [actor.id, d.shopName, d.bio, d.contact, status, now(), now()],
  );
  return status;
}

export async function listSellersByStatus(actor: Actor, status: SellerStatus): Promise<Seller[]> {
  if (!can(actor, "mkt.seller.approve")) throw new ActionError("Bạn không có quyền duyệt người bán.");
  const rows = await all<{ member_id: string }>("SELECT member_id FROM mkt_sellers WHERE status = ? ORDER BY updated_at", [status]);
  return (await Promise.all(rows.map((r) => getSeller(r.member_id)))).filter((s): s is Seller => !!s);
}

export async function decideSeller(actor: Actor, memberId: string, decision: "approve" | "reject" | "suspend" | "reinstate", reason?: string): Promise<void> {
  if (!can(actor, "mkt.seller.approve")) throw new ActionError("Bạn không có quyền duyệt người bán.");
  const s = await getSeller(memberId);
  if (!s) throw new ActionError("Không tìm thấy người bán.");
  const next: Record<typeof decision, [SellerStatus[], SellerStatus]> = {
    approve: [["pending", "rejected"], "approved"],
    reject: [["pending"], "rejected"],
    suspend: [["approved"], "suspended"],
    reinstate: [["suspended"], "approved"],
  };
  const [from, to] = next[decision];
  if (!from.includes(s.status)) throw new ActionError("Không thể thực hiện ở trạng thái hiện tại.");
  if ((decision === "reject" || decision === "suspend") && !reason?.trim()) throw new ActionError("Cần ghi lý do.");
  await run("UPDATE mkt_sellers SET status = ?, reject_reason = ?, updated_at = ? WHERE member_id = ?", [to, reason?.trim() || null, now(), memberId]);
  if (decision === "suspend") await run("UPDATE mkt_listings SET status = 'archived', updated_at = ? WHERE seller_id = ? AND status = 'published'", [now(), memberId]);
  await audit(actor.id, `mkt.seller.${decision}`, `seller:${memberId}`, "success");
}

// ───────────────────────── Listings ─────────────────────────

export type Listing = {
  id: string;
  sellerId: string;
  shopName: string;
  kind: "product" | "digital" | "service" | "course";
  category: keyof typeof CATEGORIES;
  title: string;
  description: string;
  price: number;
  stock: number | null;
  delivery: "ship" | "pickup" | "online";
  status: ContentStatus;
  rejectReason: string | null;
  rating: number | null;
  reviewCount: number;
  sold: number;
};

const LISTING_SQL = `SELECT l.*, COALESCE(s.shop_name, m.full_name) AS shop_name,
  (SELECT AVG(rating) FROM mkt_reviews r WHERE r.listing_id = l.id) AS rating,
  (SELECT COUNT(*) FROM mkt_reviews r WHERE r.listing_id = l.id) AS review_count,
  (SELECT COALESCE(SUM(oi.qty),0) FROM mkt_order_items oi JOIN mkt_orders o ON o.id = oi.order_id WHERE oi.listing_id = l.id AND o.status = 'completed') AS sold
  FROM mkt_listings l JOIN members m ON m.id = l.seller_id LEFT JOIN mkt_sellers s ON s.member_id = l.seller_id`;

type ListingRow = {
  id: string;
  seller_id: string;
  shop_name: string;
  kind: Listing["kind"];
  category: Listing["category"];
  title: string;
  description: string;
  price: number;
  stock: number | null;
  delivery: Listing["delivery"];
  status: string;
  reject_reason: string | null;
  rating: number | null;
  review_count: number;
  sold: number;
};
const toListing = (r: ListingRow): Listing => ({
  id: r.id,
  sellerId: r.seller_id,
  shopName: r.shop_name,
  kind: r.kind,
  category: r.category,
  title: r.title,
  description: r.description,
  price: Number(r.price),
  stock: r.stock === null ? null : Number(r.stock),
  delivery: r.delivery,
  status: statusOf(r.status),
  rejectReason: r.reject_reason,
  rating: r.rating === null ? null : Math.round(Number(r.rating) * 10) / 10,
  reviewCount: Number(r.review_count),
  sold: Number(r.sold),
});

export async function listPublished(f: { q?: string; category?: string; kind?: string; sellerId?: string; sort?: string } = {}): Promise<Listing[]> {
  const where = ["l.status = 'published'"];
  const args: string[] = [];
  if (f.category && f.category in CATEGORIES) (where.push("l.category = ?"), args.push(f.category));
  if (f.kind && ["product", "digital", "service", "course"].includes(f.kind)) (where.push("l.kind = ?"), args.push(f.kind));
  if (f.sellerId) (where.push("l.seller_id = ?"), args.push(f.sellerId));
  if (f.q?.trim()) (where.push("(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\')"), args.push(likeArg(f.q), likeArg(f.q)));
  const order = f.sort === "price_asc" ? "l.price ASC" : f.sort === "price_desc" ? "l.price DESC" : "l.updated_at DESC";
  return (await all<ListingRow>(`${LISTING_SQL} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`, args)).map(toListing);
}

export async function getListing(actor: Actor | null, id: string) {
  const r = await one<ListingRow>(`${LISTING_SQL} WHERE l.id = ?`, [id]);
  if (!r) return null;
  const who = { isAuthor: !!actor && actor.id === r.seller_id, canApprove: can(actor, "mkt.listing.approve") };
  if (!canViewContent(statusOf(r.status), who)) return null;
  const reviews = await all<{ id: string; rating: number; comment: string; created_at: string; full_name: string }>(
    "SELECT r.id, r.rating, r.comment, r.created_at, m.full_name FROM mkt_reviews r JOIN members m ON m.id = r.buyer_id WHERE r.listing_id = ? ORDER BY r.created_at DESC LIMIT 50",
    [id],
  );
  const fav = actor ? await one("SELECT 1 AS x FROM mkt_favorites WHERE member_id = ? AND listing_id = ?", [actor.id, id]) : null;
  return {
    ...toListing(r),
    reviews: reviews.map((x) => ({ id: x.id, rating: Number(x.rating), comment: x.comment, createdAt: x.created_at, buyerName: x.full_name })),
    isOwner: who.isAuthor,
    canApprove: who.canApprove,
    canEdit: canEditContent(statusOf(r.status), who) || (who.isAuthor && statusOf(r.status) === "published"),
    favorite: !!fav,
  };
}

const listingSchema = z
  .object({
    kind: z.enum(["product", "digital", "service", "course"]),
    category: z.string().refine((c) => c in CATEGORIES, "Chọn danh mục."),
    title: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(120),
    description: z.string().trim().min(10, "Mô tả tối thiểu 10 ký tự.").max(5000),
    price: z.coerce.number().int("Giá phải là số nguyên.").min(0, "Giá không âm.").max(MAX_AMOUNT_VND),
    stock: z.union([z.coerce.number().int().min(0).max(100000), z.null()]).default(null),
    delivery: z.enum(["ship", "pickup", "online"]),
  })
  .superRefine((v, ctx) => {
    if ((v.kind === "digital" || v.kind === "course") && v.delivery !== "online") ctx.addIssue({ code: "custom", message: "Sản phẩm số / khóa học phải giao trực tuyến." });
  });

async function requireApprovedSeller(actor: Actor) {
  const s = await getSeller(actor.id);
  if (!s || s.status !== "approved") throw new ActionError(s?.status === "pending" ? "Hồ sơ người bán đang chờ duyệt." : "Bạn cần đăng ký và được duyệt làm người bán trước.");
}

export async function createListing(actor: Actor, input: unknown): Promise<string> {
  await requireApprovedSeller(actor);
  const d = listingSchema.parse(input);
  const id = randomUUID();
  await run(
    "INSERT INTO mkt_listings (id, seller_id, kind, category, title, description, price, stock, delivery, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, actor.id, d.kind, d.category, d.title, d.description, d.price, d.stock, d.delivery, now(), now()],
  );
  return id;
}

/** Owners edit drafts/rejected freely; editing a published listing sends it back for review (BR-010). */
export async function updateListing(actor: Actor, id: string, input: unknown): Promise<ContentStatus> {
  const r = await one<{ seller_id: string; status: string }>("SELECT seller_id, status FROM mkt_listings WHERE id = ?", [id]);
  if (!r) throw new ActionError("Không tìm thấy tin đăng.");
  const isOwner = r.seller_id === actor.id;
  const status = statusOf(r.status);
  if (!isOwner) throw new ActionError("Bạn chỉ sửa được tin đăng của mình.");
  if (status === "submitted") throw new ActionError("Tin đang chờ duyệt, chưa sửa được.");
  await requireApprovedSeller(actor);
  const d = listingSchema.parse(input);
  const next: ContentStatus = status === "rejected" ? "draft" : status === "published" ? (can(actor, "mkt.listing.approve") ? "published" : "submitted") : status;
  await run("UPDATE mkt_listings SET kind = ?, category = ?, title = ?, description = ?, price = ?, stock = ?, delivery = ?, status = ?, updated_at = ? WHERE id = ?", [
    d.kind,
    d.category,
    d.title,
    d.description,
    d.price,
    d.stock,
    d.delivery,
    next,
    now(),
    id,
  ]);
  return next;
}

export async function listingTransition(actor: Actor, id: string, action: WorkflowAction, reason?: string): Promise<ContentStatus> {
  const r = await one<{ seller_id: string; status: string }>("SELECT seller_id, status FROM mkt_listings WHERE id = ?", [id]);
  if (!r) throw new ActionError("Không tìm thấy tin đăng.");
  if (action === "submit") await requireApprovedSeller(actor);
  const res = applyWorkflow(action, statusOf(r.status), { isAuthor: r.seller_id === actor.id, canApprove: can(actor, "mkt.listing.approve") }, reason);
  if (!res.ok) throw new ActionError(res.error);
  await run("UPDATE mkt_listings SET status = ?, reject_reason = ?, updated_at = ? WHERE id = ?", [res.to, res.to === "rejected" ? reason!.trim().slice(0, 500) : null, now(), id]);
  await audit(actor.id, `mkt.listing.${action}`, `listing:${id}`, "success");
  return res.to;
}

/** Owners may delete listings that were never sold; otherwise archive (orders keep their history). */
export async function deleteListing(actor: Actor, id: string): Promise<void> {
  const r = await one<{ seller_id: string }>("SELECT seller_id FROM mkt_listings WHERE id = ?", [id]);
  if (!r) throw new ActionError("Không tìm thấy tin đăng.");
  if (r.seller_id !== actor.id) throw new ActionError("Bạn chỉ xóa được tin đăng của mình.");
  const used = await one("SELECT 1 AS x FROM mkt_order_items WHERE listing_id = ? LIMIT 1", [id]);
  if (used) throw new ActionError("Tin đã có đơn hàng: hãy gỡ xuống thay vì xóa.");
  await run("DELETE FROM mkt_listings WHERE id = ?", [id]);
}

export async function myListings(actor: Actor): Promise<Listing[]> {
  return (await all<ListingRow>(`${LISTING_SQL} WHERE l.seller_id = ? ORDER BY l.updated_at DESC`, [actor.id])).map(toListing);
}

export async function listingQueue(actor: Actor): Promise<Listing[]> {
  if (!can(actor, "mkt.listing.approve")) throw new ActionError("Bạn không có quyền duyệt tin đăng.");
  return (await all<ListingRow>(`${LISTING_SQL} WHERE l.status = 'submitted' ORDER BY l.updated_at`)).map(toListing);
}

export async function toggleFavorite(actor: Actor, listingId: string): Promise<boolean> {
  const removed = await run("DELETE FROM mkt_favorites WHERE member_id = ? AND listing_id = ?", [actor.id, listingId]);
  if (removed > 0) return false;
  const l = await one("SELECT 1 AS x FROM mkt_listings WHERE id = ? AND status = 'published'", [listingId]);
  if (!l) throw new ActionError("Tin đăng không còn bán.");
  await run("INSERT INTO mkt_favorites (member_id, listing_id) VALUES (?, ?)", [actor.id, listingId]);
  return true;
}

export async function listFavorites(actor: Actor): Promise<Listing[]> {
  return (await all<ListingRow>(`${LISTING_SQL} JOIN mkt_favorites f ON f.listing_id = l.id WHERE f.member_id = ? ORDER BY l.updated_at DESC`, [actor.id])).map(toListing);
}

// ───────────────────────── Cart & checkout ─────────────────────────

const qtySchema = z.coerce.number().int().min(1, "Số lượng tối thiểu 1.").max(99, "Tối đa 99.");

export async function addToCart(actor: Actor, listingId: string, qty: unknown = 1): Promise<void> {
  const n = qtySchema.parse(qty);
  const l = await one<{ seller_id: string; status: string; stock: number | null }>("SELECT seller_id, status, stock FROM mkt_listings WHERE id = ?", [listingId]);
  if (!l || l.status !== "published") throw new ActionError("Sản phẩm không còn bán.");
  if (l.seller_id === actor.id) throw new ActionError("Bạn không thể mua sản phẩm của chính mình.");
  const cur = await one<{ qty: number }>("SELECT qty FROM mkt_cart_items WHERE member_id = ? AND listing_id = ?", [actor.id, listingId]);
  const total = Number(cur?.qty ?? 0) + n;
  if (l.stock !== null && total > Number(l.stock)) throw new ActionError(`Chỉ còn ${l.stock} sản phẩm.`);
  await run(
    "INSERT INTO mkt_cart_items (member_id, listing_id, qty, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (member_id, listing_id) DO UPDATE SET qty = excluded.qty",
    [actor.id, listingId, Math.min(total, 99), now()],
  );
}

export async function setCartQty(actor: Actor, listingId: string, qty: unknown): Promise<void> {
  const n = z.coerce.number().int().min(0).max(99).parse(qty);
  if (n === 0) {
    await run("DELETE FROM mkt_cart_items WHERE member_id = ? AND listing_id = ?", [actor.id, listingId]);
    return;
  }
  await run("UPDATE mkt_cart_items SET qty = ? WHERE member_id = ? AND listing_id = ?", [n, actor.id, listingId]);
}

export async function getCart(actor: Actor) {
  const rows = await all<{ listing_id: string; seller_id: string; title: string; price: number; qty: number; stock: number | null; status: string; delivery: string; shop_name: string }>(
    `SELECT c.listing_id, l.seller_id, l.title, l.price, c.qty, l.stock, l.status, l.delivery, COALESCE(s.shop_name, m.full_name) AS shop_name
     FROM mkt_cart_items c JOIN mkt_listings l ON l.id = c.listing_id JOIN members m ON m.id = l.seller_id LEFT JOIN mkt_sellers s ON s.member_id = l.seller_id
     WHERE c.member_id = ? ORDER BY c.added_at`,
    [actor.id],
  );
  const lines: Array<CartLine & { delivery: string; shopName: string }> = rows.map((r) => ({
    listingId: r.listing_id,
    sellerId: r.seller_id,
    title: r.title,
    price: Number(r.price),
    qty: Number(r.qty),
    stock: r.stock === null ? null : Number(r.stock),
    available: r.status === "published",
    delivery: r.delivery,
    shopName: r.shop_name,
  }));
  const groups = splitCart(lines).map((g) => ({ ...g, shopName: (g.items[0] as (typeof lines)[number]).shopName }));
  return { lines, groups, problems: cartProblems(lines), total: groups.reduce((a, g) => a + g.total, 0), needsAddress: lines.some((l) => l.delivery === "ship") };
}

export async function cartCount(actor: Actor): Promise<number> {
  return Number((await one<{ n: number }>("SELECT COALESCE(SUM(qty),0) AS n FROM mkt_cart_items WHERE member_id = ?", [actor.id]))?.n ?? 0);
}

const checkoutSchema = z.object({
  paymentMethod: z.enum(["cod", "bank_transfer", "in_person"]),
  recipientName: z.string().trim().min(2, "Nhập tên người nhận.").max(80),
  recipientPhone: z.string().trim().regex(/^(\+84|0)\d{9,10}$/, "Số điện thoại không hợp lệ."),
  address: z.string().trim().max(300).default(""),
  note: z.string().trim().max(500).default(""),
  checkoutKey: z.string().min(8).max(80),
});

/**
 * MKT-12 Checkout: one order per seller, prices and totals computed here from the DB (never from
 * the client), stock decremented atomically, and the same checkoutKey never creates duplicates.
 */
export async function checkout(actor: Actor, input: unknown): Promise<string[]> {
  const d = checkoutSchema.parse(input);
  const existing = await all<{ id: string }>("SELECT id FROM mkt_orders WHERE buyer_id = ? AND checkout_key = ?", [actor.id, d.checkoutKey]);
  if (existing.length) return existing.map((e) => e.id); // retry / double tap
  const cart = await getCart(actor);
  if (cart.lines.length === 0) throw new ActionError("Giỏ hàng trống.");
  if (cart.problems.length) throw new ActionError(cart.problems[0]);
  if (cart.needsAddress && d.address.length < 10) throw new ActionError("Nhập địa chỉ giao hàng đầy đủ.");
  if (d.paymentMethod === "cod" && !cart.needsAddress) throw new ActionError("COD chỉ dùng cho đơn giao hàng.");

  return withTransaction(async (t) => {
    const ids: string[] = [];
    for (const g of cart.groups) {
      const id = randomUUID();
      const code = orderCode(new Date(), randomBytes(4).toString("hex"));
      await t.execute(
        `INSERT INTO mkt_orders (id, code, buyer_id, seller_id, status, payment_method, total, recipient_name, recipient_phone, address, note, checkout_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, code, actor.id, g.sellerId, d.paymentMethod, g.total, d.recipientName, d.recipientPhone, d.address, d.note, d.checkoutKey, now(), now()],
      );
      for (const item of g.items) {
        const dec = await t.execute(
          "UPDATE mkt_listings SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock - ? END WHERE id = ? AND status = 'published' AND (stock IS NULL OR stock >= ?)",
          [item.qty, item.listingId, item.qty],
        );
        if (dec.rowsAffected === 0) throw new ActionError(`“${item.title}” vừa hết hàng hoặc ngừng bán.`);
        await t.execute("INSERT INTO mkt_order_items (order_id, listing_id, title, unit_price, qty) VALUES (?, ?, ?, ?, ?)", [id, item.listingId, item.title, item.price, item.qty]);
      }
      await t.execute("INSERT INTO mkt_order_events (id, order_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, NULL, 'placed', NULL, ?)", [randomUUID(), id, actor.id, now()]);
      ids.push(id);
    }
    await t.execute("DELETE FROM mkt_cart_items WHERE member_id = ?", [actor.id]);
    return ids;
  });
}

// ───────────────────────── Orders ─────────────────────────

export type OrderSummary = { id: string; code: string; status: OrderStatus; total: number; createdAt: string; counterpart: string; itemCount: number; firstTitle: string; paymentMethod: PaymentMethod; paymentStatus: "unpaid" | "paid" };

async function listOrders(where: string, args: string[], counterpartJoin: "buyer" | "seller"): Promise<OrderSummary[]> {
  const rows = await all<{ id: string; code: string; status: OrderStatus; total: number; created_at: string; counterpart: string; item_count: number; first_title: string; payment_method: PaymentMethod; payment_status: "unpaid" | "paid" }>(
    `SELECT o.id, o.code, o.status, o.total, o.created_at, o.payment_method, o.payment_status,
       ${counterpartJoin === "seller" ? "COALESCE(s.shop_name, m.full_name)" : "m.full_name"} AS counterpart,
       (SELECT SUM(qty) FROM mkt_order_items i WHERE i.order_id = o.id) AS item_count,
       (SELECT title FROM mkt_order_items i WHERE i.order_id = o.id LIMIT 1) AS first_title
     FROM mkt_orders o JOIN members m ON m.id = o.${counterpartJoin}_id LEFT JOIN mkt_sellers s ON s.member_id = o.seller_id
     WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`,
    args,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    total: Number(r.total),
    createdAt: r.created_at,
    counterpart: r.counterpart,
    itemCount: Number(r.item_count),
    firstTitle: r.first_title,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
  }));
}

export const myOrders = (actor: Actor) => listOrders("o.buyer_id = ?", [actor.id], "seller");
export const sellerOrders = (actor: Actor) => listOrders("o.seller_id = ?", [actor.id], "buyer");

/** Order detail — only the buyer or the seller of this order (object-level authz). */
export async function getOrder(actor: Actor, id: string) {
  const o = await one<{
    id: string;
    code: string;
    buyer_id: string;
    seller_id: string;
    status: OrderStatus;
    payment_method: PaymentMethod;
    payment_status: "unpaid" | "paid";
    total: number;
    recipient_name: string;
    recipient_phone: string;
    address: string;
    note: string;
    cancel_reason: string | null;
    created_at: string;
    buyer_name: string;
    shop_name: string;
    contact: string | null;
  }>(
    `SELECT o.*, b.full_name AS buyer_name, COALESCE(s.shop_name, sm.full_name) AS shop_name, s.contact
     FROM mkt_orders o JOIN members b ON b.id = o.buyer_id JOIN members sm ON sm.id = o.seller_id LEFT JOIN mkt_sellers s ON s.member_id = o.seller_id WHERE o.id = ?`,
    [id],
  );
  if (!o || (o.buyer_id !== actor.id && o.seller_id !== actor.id)) return null;
  const role = o.buyer_id === actor.id ? ("buyer" as const) : ("seller" as const);
  const items = await all<{ listing_id: string; title: string; unit_price: number; qty: number; reviewed: number }>(
    `SELECT i.listing_id, i.title, i.unit_price, i.qty, (SELECT COUNT(*) FROM mkt_reviews r WHERE r.order_id = i.order_id AND r.listing_id = i.listing_id) AS reviewed
     FROM mkt_order_items i WHERE i.order_id = ?`,
    [id],
  );
  const events = await all<{ to_status: string; note: string | null; created_at: string }>("SELECT to_status, note, created_at FROM mkt_order_events WHERE order_id = ? ORDER BY created_at", [id]);
  const state = { status: o.status, paymentMethod: o.payment_method, paymentStatus: o.payment_status };
  return {
    id: o.id,
    code: o.code,
    role,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    total: Number(o.total),
    recipientName: o.recipient_name,
    recipientPhone: o.recipient_phone,
    address: o.address,
    note: o.note,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    buyerName: o.buyer_name,
    shopName: o.shop_name,
    sellerContact: o.contact ?? "",
    items: items.map((i) => ({ listingId: i.listing_id, title: i.title, unitPrice: Number(i.unit_price), qty: Number(i.qty), reviewed: Number(i.reviewed) > 0 })),
    events: events.map((e) => ({ status: e.to_status, note: e.note, at: e.created_at })),
    actions: availableActions(state, role),
    canReview: role === "buyer" && canReview(o.status),
  };
}

export async function orderAction(actor: Actor, orderId: string, action: OrderAction, reason?: string): Promise<OrderStatus> {
  const o = await one<{ buyer_id: string; seller_id: string; status: OrderStatus; payment_method: PaymentMethod; payment_status: "unpaid" | "paid" }>(
    "SELECT buyer_id, seller_id, status, payment_method, payment_status FROM mkt_orders WHERE id = ?",
    [orderId],
  );
  if (!o || (o.buyer_id !== actor.id && o.seller_id !== actor.id)) throw new ActionError("Không tìm thấy đơn hàng.");
  const role = o.buyer_id === actor.id ? "buyer" : "seller";
  const res = applyOrderAction({ status: o.status, paymentMethod: o.payment_method, paymentStatus: o.payment_status }, action, role, reason);
  if (!res.ok) throw new ActionError(res.error);
  await withTransaction(async (t) => {
    // Optimistic check: the status must still be what we validated against.
    const upd = await t.execute("UPDATE mkt_orders SET status = ?, payment_status = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND status = ?", [
      res.status,
      res.paymentStatus,
      action === "cancel" ? (reason?.trim() || "Người mua hủy") : null,
      now(),
      orderId,
      o.status,
    ]);
    if (upd.rowsAffected === 0) throw new ActionError("Đơn vừa được cập nhật bởi người khác. Tải lại và thử lại.");
    if (action === "cancel") {
      const items = await t.execute("SELECT listing_id, qty FROM mkt_order_items WHERE order_id = ?", [orderId]);
      for (const i of items.rows) await t.execute("UPDATE mkt_listings SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL", [Number(i.qty), String(i.listing_id)]);
    }
    await t.execute("INSERT INTO mkt_order_events (id, order_id, actor_id, from_status, to_status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      randomUUID(),
      orderId,
      actor.id,
      o.status,
      action === "mark_paid" ? "paid" : res.status,
      reason?.trim() || null,
      now(),
    ]);
  });
  await audit(actor.id, `mkt.order.${action}`, `order:${orderId}`, "success");
  return res.status;
}

const reviewSchema = z.object({ rating: z.coerce.number().int().min(1, "Chọn số sao.").max(5), comment: z.string().trim().max(1000).default("") });

export async function reviewItem(actor: Actor, orderId: string, listingId: string, input: unknown): Promise<void> {
  const d = reviewSchema.parse(input);
  const o = await one<{ buyer_id: string; status: OrderStatus }>("SELECT buyer_id, status FROM mkt_orders WHERE id = ?", [orderId]);
  if (!o || o.buyer_id !== actor.id) throw new ActionError("Bạn chỉ đánh giá được đơn của mình.");
  if (!canReview(o.status)) throw new ActionError("Chỉ đánh giá sau khi đã nhận hàng.");
  const item = await one("SELECT 1 AS x FROM mkt_order_items WHERE order_id = ? AND listing_id = ?", [orderId, listingId]);
  if (!item) throw new ActionError("Sản phẩm không thuộc đơn này.");
  const dup = await one("SELECT 1 AS x FROM mkt_reviews WHERE order_id = ? AND listing_id = ?", [orderId, listingId]);
  if (dup) throw new ActionError("Bạn đã đánh giá sản phẩm này.");
  await run("INSERT INTO mkt_reviews (id, order_id, listing_id, buyer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    orderId,
    listingId,
    actor.id,
    d.rating,
    d.comment,
    now(),
  ]);
}

/** SELL-01 dashboard figures (SELL-12 revenue = completed orders). */
export async function sellerStats(actor: Actor) {
  const r = await one<{ revenue: number; completed: number; open: number; listings: number; rating: number | null }>(
    `SELECT (SELECT COALESCE(SUM(total),0) FROM mkt_orders WHERE seller_id = ? AND status = 'completed') AS revenue,
            (SELECT COUNT(*) FROM mkt_orders WHERE seller_id = ? AND status = 'completed') AS completed,
            (SELECT COUNT(*) FROM mkt_orders WHERE seller_id = ? AND status IN ('placed','confirmed','shipping','delivered')) AS open,
            (SELECT COUNT(*) FROM mkt_listings WHERE seller_id = ? AND status = 'published') AS listings,
            (SELECT AVG(r.rating) FROM mkt_reviews r JOIN mkt_listings l ON l.id = r.listing_id WHERE l.seller_id = ?) AS rating`,
    [actor.id, actor.id, actor.id, actor.id, actor.id],
  );
  return {
    revenue: Number(r?.revenue ?? 0),
    completed: Number(r?.completed ?? 0),
    open: Number(r?.open ?? 0),
    listings: Number(r?.listings ?? 0),
    rating: r?.rating === null || r?.rating === undefined ? null : averageRating([Number(r.rating)]),
  };
}
