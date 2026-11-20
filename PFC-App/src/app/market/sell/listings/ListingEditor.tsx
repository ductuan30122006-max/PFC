"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/modules/market/domain/orders";
import { createListingAction, deleteListingAction, listingTransitionAction, updateListingAction } from "@/modules/market/server/actions";
import type { ContentStatus } from "@/platform/workflow";
import { AmountInput, Button, Section } from "@/ui";
import { FormError, SelectInput, TextArea, TextInput, Toggle } from "@/ui/Form";
import { WorkflowBar } from "@/ui/WorkflowBar";
import { useAction } from "@/ui/use-action";

type V = { kind: string; category: string; title: string; description: string; price: string; stock: string; unlimited: boolean; delivery: string };
type Existing = { id: string; status: ContentStatus; rejectReason: string | null; canApprove: boolean } & V;

/** SELL-05 Create / SELL-06 Edit Product + publish workflow (mockup 129). */
export function ListingEditor({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const [v, setV] = useState<V>(existing ?? { kind: "product", category: "book", title: "", description: "", price: "", stock: "1", unlimited: false, delivery: "ship" });
  const { run, pending, error } = useAction();
  const set = (k: keyof V) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const online = v.kind === "digital" || v.kind === "course";
  const payload = () => ({
    kind: v.kind,
    category: v.category,
    title: v.title,
    description: v.description,
    price: Number(v.price || 0),
    stock: v.unlimited ? null : Number(v.stock || 0),
    delivery: online ? "online" : v.delivery,
  });

  return (
    <>
      {existing && (
        <Section>
          <WorkflowBar
            status={existing.status}
            isAuthor
            canApprove={existing.canApprove}
            rejectReason={existing.rejectReason}
            submitLabel="Gửi duyệt tin"
            canDelete
            onAction={async (a, r) => {
              const res = await listingTransitionAction(existing.id, a, r);
              if (res.ok) router.refresh();
              return res.ok ? { ok: true } : res;
            }}
            onDelete={async () => {
              const res = await deleteListingAction(existing.id);
              if (res.ok) router.replace("/market/sell");
              return res.ok ? { ok: true } : res;
            }}
          />
          {existing.status === "published" && <p className="mt-2 text-[12px] text-muted">Sửa tin đang bán sẽ gửi lại để duyệt.</p>}
        </Section>
      )}
      <form
        className="space-y-4 px-4 pt-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (existing) run(() => updateListingAction(existing.id, payload()), () => router.refresh());
          else run(() => createListingAction(payload()), (id) => router.replace(`/market/sell/listings/${id}`));
        }}
      >
        <fieldset disabled={existing?.status === "submitted"} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Loại" value={v.kind} onChange={set("kind")}>
              <option value="product">Sản phẩm</option>
              <option value="digital">Sản phẩm số</option>
              <option value="service">Dịch vụ</option>
              <option value="course">Khóa học</option>
            </SelectInput>
            <SelectInput label="Danh mục" value={v.category} onChange={set("category")}>
              {Object.entries(CATEGORIES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextInput label="Tiêu đề" value={v.title} onChange={set("title")} maxLength={120} />
          <TextArea label="Mô tả" value={v.description} onChange={set("description")} maxLength={5000} rows={5} placeholder="Tình trạng, nội dung, cách nhận hàng…" />
          <AmountInput label="Giá bán (VND)" value={v.price} onChange={(p) => setV({ ...v, price: p })} />
          <Toggle label="Không giới hạn số lượng" description="Dùng cho dịch vụ, sản phẩm số" checked={v.unlimited} onChange={(b) => setV({ ...v, unlimited: b })} />
          {!v.unlimited && <TextInput label="Số lượng trong kho" type="number" inputMode="numeric" min={0} value={v.stock} onChange={set("stock")} />}
          {online ? (
            <p className="text-[13px] text-muted">Giao trực tuyến (gửi link / tài liệu sau khi xác nhận đơn).</p>
          ) : (
            <SelectInput label="Cách giao" value={v.delivery} onChange={set("delivery")}>
              <option value="ship">Giao hàng tận nơi</option>
              <option value="pickup">Nhận trực tiếp</option>
              <option value="online">Trực tuyến</option>
            </SelectInput>
          )}
          <FormError message={error} />
          <Button type="submit" block disabled={pending}>
            {pending ? "Đang lưu…" : existing ? "Lưu thay đổi" : "Lưu bản nháp"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
