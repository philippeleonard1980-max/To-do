import { prisma } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = route(async (request: Request) => {
  const body = loginSchema.parse(await request.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Same message either way so the endpoint can't be used to enumerate emails.
  const invalid = new HttpError(401, "That email and password don't match.");
  if (!user) {
    // Burn comparable time so a missing user isn't detectable by timing.
    await verifyPassword(body.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu");
    throw invalid;
  }
  if (!(await verifyPassword(body.password, user.passwordHash))) throw invalid;

  await setSessionCookie(user.id);
  return json({ id: user.id, username: user.username, displayName: user.displayName });
});
