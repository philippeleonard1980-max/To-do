import { clearSessionCookie } from "@/lib/auth";
import { json, route } from "@/lib/api";

export const runtime = "nodejs";

export const POST = route(async () => {
  await clearSessionCookie();
  return json({ ok: true });
});
