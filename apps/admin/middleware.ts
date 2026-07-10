import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session-edge";

const PUBLIC_PAGES = ["/", "/login"];

const PUBLIC_API_PREFIXES = [
  "/api/enroll",
  "/api/ingest/",
  "/api/devices/",
  "/api/auth/login",
  "/api/health",
];

function isPublicPage(path: string): boolean {
  return PUBLIC_PAGES.includes(path) || path.startsWith("/(public)");
}

function isPublicApi(path: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
}

function isStaticAsset(path: string): boolean {
  return /\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js|map)$/i.test(path);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStaticAsset(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();

    const token = req.cookies.get(COOKIE_NAME)?.value;
    const email = token ? await verifySessionToken(token) : null;
    if (!email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const email = token ? await verifySessionToken(token) : null;

  if (!email) {
    const login = new URL("/login", req.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
