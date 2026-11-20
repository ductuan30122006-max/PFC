import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTempDbs, useTempDb } from "../../../../test/db";

useTempDb();
const { makeMember } = await import("../../../../test/members");
const mkt = await import("./service");
const { one, run } = await import("@/platform/db/client");

type M = Awaited<ReturnType<typeof makeMember>>;
let owner: M, headTT: M, seller: M, buyer: M, buyer2: M;
let listingId: string;

const LISTING = { kind: "product", category: "book", title: "Sách Tư duy tài chính", description: "Sách mới 100%, bìa mềm.", price: 189000, stock: 2, delivery: "ship" };
const SHIP = { paymentMethod: "cod", recipientName: "Người Mua", recipientPhone: "0901234567", address: "123 Nguyễn Văn Cừ, Quận 1, TP.HCM" };

beforeAll(async () => {
  owner = await makeMember("chu_nhiem");
  headTT = await makeMember("truong_ban", "truyen_thong");
  seller = await makeMember("thanh_vien", null, "Người bán");
  buyer = await makeMember("thanh_vien", null, "Người mua");
  buyer2 = await makeMember("thanh_vien", null, "Người mua 2");
});
afterAll(cleanupTempDbs);

describe("sellers", () => {
  it("must be approved before listing anything", async () => {
    await expect(mkt.createListing(seller, LISTING)).rejects.toThrow(/đăng ký/);
    expect(await mkt.registerSeller(seller, { shopName: "Nhà sách Minh", contact: "Zalo 0901234567" })).toBe("pending");
    await expect(mkt.createListing(seller, LISTING)).rejects.toThrow(/chờ duyệt/);
  });
  it("only Chủ nhiệm / Ban điều hành approve sellers", async () => {
    await expect(mkt.decideSeller(buyer, seller.id, "approve")).rejects.toThrow(/quyền/);
    await expect(mkt.decideSeller(headTT, seller.id, "approve")).rejects.toThrow(/quyền/);
    await mkt.decideSeller(owner, seller.id, "approve");
    expect((await mkt.getSeller(seller.id))?.status).toBe("approved");
  });
});

describe("listings", () => {
  it("drafts are private; submitting needs review by Trưởng ban Truyền thông / Chủ nhiệm", async () => {
    listingId = await mkt.createListing(seller, LISTING);
    expect(await mkt.getListing(buyer, listingId)).toBeNull();
    expect(await mkt.listingTransition(seller, listingId, "submit")).toBe("submitted");
    await expect(mkt.listingTransition(buyer, listingId, "approve")).rejects.toThrow(/quyền/);
    expect(await mkt.listingTransition(headTT, listingId, "approve")).toBe("published");
    expect((await mkt.listPublished()).map((l) => l.id)).toContain(listingId);
  });
  it("validates content (digital must be online) and owner-only edits", async () => {
    await expect(mkt.createListing(seller, { ...LISTING, kind: "digital", delivery: "ship" })).rejects.toThrow(/trực tuyến/);
    await expect(mkt.updateListing(buyer, listingId, LISTING)).rejects.toThrow(/của mình/);
    await expect(mkt.deleteListing(buyer, listingId)).rejects.toThrow(/của mình/);
  });
});

describe("cart & checkout", () => {
  it("cannot buy your own listing or more than the stock", async () => {
    await expect(mkt.addToCart(seller, listingId, 1)).rejects.toThrow(/chính mình/);
    await expect(mkt.addToCart(buyer, listingId, 3)).rejects.toThrow(/Chỉ còn 2/);
  });

  it("totals come from the server, the cart empties, stock drops, and retries don't duplicate", async () => {
    await mkt.addToCart(buyer, listingId, 2);
    const cart = await mkt.getCart(buyer);
    expect(cart.total).toBe(378000);
    // Tampering with the price after adding to cart cannot lower what is charged… the order uses the DB price.
    await run("UPDATE mkt_listings SET price = 200000 WHERE id = ?", [listingId]);
    const ids = await mkt.checkout(buyer, { ...SHIP, checkoutKey: "key-0001-abcd" });
    expect(ids).toHaveLength(1);
    const again = await mkt.checkout(buyer, { ...SHIP, checkoutKey: "key-0001-abcd" });
    expect(again).toEqual(ids);
    const o = await one<{ total: number }>("SELECT total FROM mkt_orders WHERE id = ?", [ids[0]]);
    expect(Number(o?.total)).toBe(400000);
    expect((await mkt.getCart(buyer)).lines).toHaveLength(0);
    expect(Number((await one<{ stock: number }>("SELECT stock FROM mkt_listings WHERE id = ?", [listingId]))?.stock)).toBe(0);
  });

  it("never oversells: the last items can't be bought twice", async () => {
    await run("UPDATE mkt_listings SET stock = 1 WHERE id = ?", [listingId]);
    await mkt.addToCart(buyer2, listingId, 1);
    await run("UPDATE mkt_listings SET stock = 0 WHERE id = ?", [listingId]); // someone else bought it meanwhile
    await expect(mkt.checkout(buyer2, { ...SHIP, checkoutKey: "key-0002-abcd" })).rejects.toThrow(/chỉ còn 0|hết hàng/);
    expect(await one("SELECT id FROM mkt_orders WHERE buyer_id = ?", [buyer2.id])).toBeNull(); // rolled back entirely
  });

  it("delivery orders need an address", async () => {
    await run("UPDATE mkt_listings SET stock = 5 WHERE id = ?", [listingId]);
    await expect(mkt.checkout(buyer2, { ...SHIP, address: "", checkoutKey: "key-0003-abcd" })).rejects.toThrow(/địa chỉ/);
  });
});

describe("orders", () => {
  let orderId: string;
  beforeAll(async () => {
    orderId = (await mkt.myOrders(buyer))[0].id;
  });

  it("only the buyer and the seller can see an order", async () => {
    expect((await mkt.getOrder(buyer, orderId))?.role).toBe("buyer");
    expect((await mkt.getOrder(seller, orderId))?.role).toBe("seller");
    expect(await mkt.getOrder(buyer2, orderId)).toBeNull();
    expect(await mkt.getOrder(owner, orderId)).toBeNull();
    await expect(mkt.orderAction(buyer2, orderId, "cancel")).rejects.toThrow(/Không tìm thấy/);
  });

  it("no review before completion; full lifecycle; then exactly one review", async () => {
    await expect(mkt.reviewItem(buyer, orderId, listingId, { rating: 5 })).rejects.toThrow(/sau khi/);
    await expect(mkt.orderAction(buyer, orderId, "confirm")).rejects.toThrow(/người bán/);
    await mkt.orderAction(seller, orderId, "confirm");
    await mkt.orderAction(seller, orderId, "ship");
    await mkt.orderAction(seller, orderId, "deliver");
    expect(await mkt.orderAction(buyer, orderId, "complete")).toBe("completed");
    const o = await mkt.getOrder(buyer, orderId);
    expect(o?.paymentStatus).toBe("paid");
    expect(o?.events.map((e) => e.status)).toEqual(["placed", "confirmed", "shipping", "delivered", "completed"]);
    await mkt.reviewItem(buyer, orderId, listingId, { rating: 5, comment: "Sách đẹp" });
    await expect(mkt.reviewItem(buyer, orderId, listingId, { rating: 4 })).rejects.toThrow(/đã đánh giá/);
    expect((await mkt.getListing(null, listingId))?.rating).toBe(5);
    expect((await mkt.sellerStats(seller)).revenue).toBe(400000);
  });

  it("cancelling restores stock", async () => {
    // buyer2 still has 1 in the cart from the rolled-back checkout above (cart is kept on failure).
    await mkt.setCartQty(buyer2, listingId, 2);
    const [id] = await mkt.checkout(buyer2, { ...SHIP, checkoutKey: "key-0004-abcd" });
    const before = Number((await one<{ stock: number }>("SELECT stock FROM mkt_listings WHERE id = ?", [listingId]))?.stock);
    await mkt.orderAction(buyer2, id, "cancel");
    const after = Number((await one<{ stock: number }>("SELECT stock FROM mkt_listings WHERE id = ?", [listingId]))?.stock);
    expect(after).toBe(before + 2);
  });
});

describe("suspension", () => {
  it("suspending a seller takes their listings down", async () => {
    await expect(mkt.decideSeller(owner, seller.id, "suspend")).rejects.toThrow(/lý do/);
    await mkt.decideSeller(owner, seller.id, "suspend", "Vi phạm quy định");
    expect((await mkt.listPublished()).map((l) => l.id)).not.toContain(listingId);
  });
});

describe("listing photos", () => {
  it("accepts the seller's own uploads only, keeping the order", async () => {
    const sharp = (await import("sharp")).default;
    const { saveImage } = await import("@/platform/uploads/service");
    process.env.PFC_UPLOAD_DIR = ".data/test/uploads";
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await mkt.registerSeller(owner, { shopName: "Shop Chủ nhiệm", contact: "Zalo 0900000000" });
    const a = await saveImage(owner, "listing", png);
    const b = await saveImage(owner, "listing", png);
    const foreign = await saveImage(buyer, "listing", png);
    const id = await mkt.createListing(owner, { ...LISTING, title: "Sách có ảnh", images: [b.url, a.url] });
    expect((await mkt.getListing(owner, id))?.images).toEqual([b.url, a.url]);
    await expect(mkt.createListing(owner, { ...LISTING, images: [foreign.url] })).rejects.toThrow(/không phải của bạn/);
    await expect(mkt.createListing(owner, { ...LISTING, images: ["https://evil.example/x.png"] })).rejects.toThrow(/không phải của bạn/);
    await mkt.updateListing(owner, id, { ...LISTING, title: "Sách có ảnh", images: [a.url] });
    expect((await mkt.getListing(owner, id))?.images).toEqual([a.url]);
  });
});
