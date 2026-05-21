import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE = "arb_admin";

/**
 * Single-user admin gate. Every request must carry an `arb_admin` cookie
 * whose value matches the `ADMIN_TOKEN` env var, otherwise it is bounced
 * to `/login`. If `ADMIN_TOKEN` is not configured, the app fails closed
 * — every route redirects to `/login` and the login form will refuse to
 * authenticate. This is intentional for a money app.
 *
 * The matcher below excludes Next.js internals (`_next/*`), static assets,
 * the health endpoint, and the login page itself.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Always allow the health check + the login surface itself.
  if (pathname === "/api/health" || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const expected = process.env.ADMIN_TOKEN;
  const provided = req.cookies.get(ADMIN_COOKIE)?.value;

  // Fail closed if no token is configured at all.
  if (!expected || !provided || provided !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next internals, static assets, and the
    // explicit allowlist handled inside the middleware body.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
