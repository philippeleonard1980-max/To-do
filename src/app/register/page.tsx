import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getViewer()) redirect("/");
  return <AuthForm mode="register" />;
}
