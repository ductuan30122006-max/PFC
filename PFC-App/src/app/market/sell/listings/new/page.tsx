import { redirect } from "next/navigation";
import { requireMember, toActor } from "@/platform/auth/session";
import { getSettings } from "@/platform/settings/service";
import { getSeller, linkableItems } from "@/modules/market/server/service";
import { AppHeader } from "@/ui";
import { ListingEditor } from "../ListingEditor";

export const metadata = { title: "Đăng tin" };
export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const me = await requireMember("/market/sell/listings/new");
  const s = await getSeller(me.id);
  if (!s || s.status !== "approved") redirect("/market/sell");
  const [links, settings] = await Promise.all([linkableItems(toActor(me)), getSettings()]);
  return (
    <>
      <AppHeader back backFallback="/market/sell" title="Đăng tin mới" />
      <ListingEditor links={links} level={s.level} limits={settings.market} />
    </>
  );
}
