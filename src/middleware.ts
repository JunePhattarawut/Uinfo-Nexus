import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register"];
const authHits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 30;

function withSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

function rateLimitAuth(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const key = `${ip}:${new URL(req.url).pathname}`;
  const hit = authHits.get(key);
  if (!hit || hit.resetAt < now) {
    authHits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  hit.count += 1;
  if (hit.count > LIMIT) return withSecurityHeaders(new NextResponse("Too many auth requests", { status: 429 }));
  return null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    const limited = rateLimitAuth(req);
    if (limited) return limited;
  }

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    return withSecurityHeaders(NextResponse.redirect(url));
  }
  if (isLoggedIn && PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.nextUrl)));
  }
  return withSecurityHeaders(NextResponse.next());
});

export const config = {
  // /api is excluded entirely: API routes authenticate via requireUser and
  // must answer 401 JSON, never a login redirect (HANDOFF §6).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
