import { requireMember } from "@/platform/auth/session";
import { AppHeader } from "@/ui";
import { ResourceForm } from "../ResourceForm";

export const metadata = { title: "Tài liệu mới" };

export default async function NewResourcePage() {
  await requireMember("/learn/manage/resources/new");
  return (
    <>
      <AppHeader back backFallback="/learn/manage" title="Tài liệu mới" />
      <ResourceForm />
    </>
  );
}
