import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getViewer()) redirect("/");
  return <AuthForm mode="login" />;
}
