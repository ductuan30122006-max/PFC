import { requireMember } from "@/platform/auth/session";
import { onlinePaymentEnabled } from "@/modules/payments/server/service";
import { EventForm } from "@/modules/events/ui/EventForm";
import { AppHeader } from "@/ui";

export const metadata = { title: "Tạo sự kiện" };
export const dynamic = "force-dynamic";

/** EVT-05 Create Event. */
export default async function NewEventPage() {
  await requireMember("/events/new");
  return (
    <>
      <AppHeader back backFallback="/events" title="Tạo sự kiện" />
      <EventForm onlinePayments={onlinePaymentEnabled()} />
    </>
  );
}
