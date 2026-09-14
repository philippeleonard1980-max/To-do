import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { prisma } from "./db";
import { SESSION_COOKIE } from "./session-cookie";
import { type Plan, type UserRole, planInfo } from "./constants";
import { DEFAULT_SETTINGS, normalizeSettings, type UserSettings } from "./settings";

// Re-exported so existing importers keep a single entry point for the viewer.
export { DEFAULT_SETTINGS, normalizeSettings };
export type { UserSettings };

export { SESSION_COOKIE } from "./session-cookie";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    // Failing loudly beats silently signing sessions with a guessable key.
    throw new Error(
      "AUTH_SECRET is missing or too short. Set it in .env (see .env.example).",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export interface Viewer {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  plan: Plan;
  credits: number;
  allowMature: boolean;
  isAdult: boolean;
  settings: UserSettings;
}

function isAdult(birthdate: Date | null): boolean {
  if (!birthdate) return false;
  const eighteen = new Date();
  eighteen.setFullYear(eighteen.getFullYear() - 18);
  return birthdate.getTime() <= eighteen.getTime();
}

/**
 * Resolves the signed-in user, refilling monthly credits when the cycle rolls
 * over. Returns null for signed-out visitors rather than throwing, so public
 * pages can render for everyone.
 */
export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await readSessionToken(token);
  if (!userId) return null;

  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const monthMs = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - user.creditsResetAt.getTime() > monthMs) {
    const grant = planInfo(user.plan as Plan).credits;
    user = await prisma.user.update({
      where: { id: user.id },
      data: { credits: grant, creditsResetAt: new Date() },
    });
    await prisma.creditEntry.create({
      data: { userId: user.id, delta: grant, reason: "monthly-refill" },
    });
  }

  const adult = isAdult(user.birthdate);
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role as UserRole,
    plan: user.plan as Plan,
    credits: user.credits,
    // Mature content requires both a verified adult birthdate and an opt-in.
    allowMature: adult && user.allowMature,
    isAdult: adult,
    settings: normalizeSettings(user.settings),
  };
}

/** Like getViewer but throws a 401-shaped error for protected routes. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    const error = new Error("You need to be signed in to do that.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return viewer;
}
