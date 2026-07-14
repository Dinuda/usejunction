import type { NextAuthConfig } from "next-auth";

export default {
  // Auth.js must trust the host header for local Next.js development. In
  // production this remains opt-in so a reverse proxy must be configured
  // explicitly with AUTH_TRUST_HOST=true.
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      if (/\.(?:png|svg|jpg|jpeg|gif|webp|ico)$/.test(pathname)) return true;
      if (pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname.startsWith("/join") || pathname.startsWith("/connect-invite") || pathname.startsWith("/i/") || pathname.startsWith("/verify") || pathname.startsWith("/forgot") || pathname.startsWith("/reset") || pathname.startsWith("/contact") || pathname === "/install.sh" || pathname.startsWith("/releases/") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/contact") || pathname.startsWith("/api/health") || pathname.startsWith("/api/join") || pathname.startsWith("/api/connect-invite") || pathname.startsWith("/api/i/") || pathname.startsWith("/api/enroll") || pathname.startsWith("/api/ingest") || pathname.startsWith("/api/devices") || pathname.startsWith("/api/otel") || pathname.startsWith("/api/cron") || pathname.startsWith("/api/webhooks")) {
        return true;
      }
      return Boolean(auth);
    },
  },
  providers: [],
} satisfies NextAuthConfig;
