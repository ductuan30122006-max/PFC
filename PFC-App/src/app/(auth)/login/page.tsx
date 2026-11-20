import { redirect } from "next/navigation";
import { currentMember } from "@/platform/auth/session";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentMember()) redirect(next?.startsWith("/") && !next.startsWith("//") ? next : "/home");
  return <AuthForm mode="login" next={next} />;
}
