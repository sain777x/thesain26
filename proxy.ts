import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Barreira leve: sem cookie de sessão, /painel e /admin voltam para o login.
 * O papel (vendedor ou dono) é conferido de novo no layout e em cada API,
 * porque o proxy não consulta o banco.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath =
    pathname.startsWith("/painel") || pathname.startsWith("/admin");
  if (!protectedPath) return NextResponse.next();

  const token =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/admin/:path*"],
};
