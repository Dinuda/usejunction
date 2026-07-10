import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API_PREFIXES = [
  "/api/enroll",
  "/api/ingest/",
  "/api/devices/",
  "/api/auth/login",
  "/api/health",
];

function isPublicApi(path: string) {
  return PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (/\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|css|js|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === "/" || pathname === "/login" || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
