import { redirect } from "next/navigation";
import { requireMember } from "@/platform/auth/session";
import { getSeller } from "@/modules/market/server/service";
import { AppHeader } from "@/ui";
import { ListingEditor } from "../ListingEditor";

export const metadata = { title: "Đăng tin" };
export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const me = await requireMember("/market/sell/listings/new");
  const s = await getSeller(me.id);
  if (!s || s.status !== "approved") redirect("/market/sell");
  return (
    <>
      <AppHeader back backFallback="/market/sell" title="Đăng tin mới" />
      <ListingEditor />
    </>
  );
}
