import { NextResponse, type NextRequest } from "next/server";
import { decodeHint } from "@/lib/session-hint";

/**
 * Route guards (docs/07 §5).
 *
 * Guards read the client-written `session_hint` cookie. This is a UX guard:
 * the FastAPI app re-authorizes every request (bearer JWT + role dependency),
 * so forging this cookie cannot grant data access. The access token itself is
 * never stored in a cookie.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hint = decodeHint(request.cookies.get("session_hint")?.value);

  if (!hint) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && hint.role !== "ADMIN") {
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    url.search = "";
    url.searchParams.set("denied", "admin");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/checkout/:path*"],
};
