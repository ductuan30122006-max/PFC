import { redirect } from "next/navigation";
import { currentMember } from "@/platform/auth/session";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Đăng ký" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentMember()) redirect("/home");
  return <AuthForm mode="register" next={next} />;
}
