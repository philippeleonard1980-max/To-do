import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Edge auth guard.
 *
 * Pages call `redirect("/login")` themselves, but a Server Component redirect
 * during streaming SSR lands as a 200 with a client-side hop because headers
 * are already flushed. This runs first and issues a real 307, so signed-out
 * requests never start rendering a protected page.
 *
 * It only checks the session signature — it never touches the database. The
 * pages still re-verify the viewer, so this is defence in depth, not the only
 * gate.
 */
const PROTECTED = [
  /^\/chats/,
  /^\/chat\//,
  /^\/create/,
  /^\/personas/,
  /^\/settings/,
  /^\/pricing/,
  /^\/group/,
  /^\/character\/[^/]+\/edit/,
  // Signed-out requests are bounced here; the admin *role* is verified in
  // src/lib/admin.ts, which the middleware cannot do without database access.
  /^\/admin/,
];
const AUTH_PAGES = [/^\/login/, /^\/register/];

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return false;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED.some((pattern) => pattern.test(pathname));
  const isAuthPage = AUTH_PAGES.some((pattern) => pattern.test(pathname));
  if (!isProtected && !isAuthPage) return NextResponse.next();

  const signedIn = await hasValidSession(request);

  if (isProtected && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were heading so login can send them back.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url, 307);
  }

  if (isAuthPage && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|uploads|favicon.ico).*)"],
};
