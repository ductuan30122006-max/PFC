import { notFound } from "next/navigation";
import { requireMember, toActor } from "@/platform/auth/session";
import { getListing } from "@/modules/market/server/service";
import { AppHeader } from "@/ui";
import { ListingEditor } from "../ListingEditor";

export const dynamic = "force-dynamic";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember(`/market/sell/listings/${id}`);
  const l = await getListing(toActor(me), id);
  if (!l || !l.isOwner) notFound();
  return (
    <>
      <AppHeader back backFallback="/market/sell" title="Quản lý tin đăng" />
      <ListingEditor
        existing={{
          id: l.id,
          status: l.status,
          rejectReason: l.rejectReason,
          canApprove: l.canApprove,
          kind: l.kind,
          category: l.category,
          title: l.title,
          description: l.description,
          price: String(l.price),
          stock: String(l.stock ?? 0),
          unlimited: l.stock === null,
          delivery: l.delivery,
          images: l.images,
        }}
      />
    </>
  );
}
