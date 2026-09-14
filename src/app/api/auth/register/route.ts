import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { badRequest, forbidden, json, route } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { slugify, usernameFromEmail } from "@/lib/slug";
import { planInfo } from "@/lib/constants";

export const runtime = "nodejs";

export const POST = route(async (request: Request) => {
  if (process.env.ALLOW_SIGNUPS === "false") {
    throw forbidden("Registration is closed on this instance.");
  }

  const body = registerSchema.parse(await request.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw badRequest("An account with that email already exists.");

  const username = await uniqueUsername(body.username ?? usernameFromEmail(body.email));

  let birthdate: Date | null = null;
  if (body.birthdate) {
    const parsed = new Date(body.birthdate);
    if (Number.isNaN(parsed.getTime())) throw badRequest("That birthdate isn't a valid date.");
    if (parsed.getTime() > Date.now()) throw badRequest("Birthdate can't be in the future.");
    birthdate = parsed;
  }

  const user = await prisma.user.create({
    data: {
      email: body.email,
      username,
      displayName: body.displayName,
      passwordHash: await hashPassword(body.password),
      credits: planInfo("free").credits,
      birthdate,
      // Every account starts with a persona so the first chat has a "you".
      personas: {
        create: { name: body.displayName, description: "", isDefault: true },
      },
    },
  });

  await setSessionCookie(user.id);
  return json({ id: user.id, username: user.username, displayName: user.displayName }, { status: 201 });
});

/** Appends a numeric suffix until the handle is free. */
async function uniqueUsername(base: string): Promise<string> {
  const root = slugify(base, "user").slice(0, 20) || "user";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
