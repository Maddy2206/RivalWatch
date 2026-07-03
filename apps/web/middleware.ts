import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only — checks the session cookie's presence, not its
 * validity (no DB call from middleware/edge runtime). The dashboard layout
 * does the real `auth.api.getSession` check server-side.
 */
export function middleware(request: NextRequest): NextResponse {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/competitors/:path*", "/changes/:path*", "/billing/:path*"],
};
