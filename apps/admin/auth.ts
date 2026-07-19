import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { prisma } from "@usejunction/db";
import authConfig from "./auth.config";

const MAX_PASSWORD_BYTES = 256;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
        if (!user?.passwordHash || !user.emailVerified) return null;
        if (!(await compare(password, user.passwordHash))) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          orgId: user.memberships[0]?.orgId ?? null,
          role: user.memberships[0]?.role ?? null,
        };
      },
    }),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET })]
      : []),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
    ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email ?? null;
        token.picture = user.image ?? null;
        token.orgId = (user as { orgId?: string | null }).orgId ?? null;
        token.role = (user as { role?: string | null }).role ?? null;
      }
      if (token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: String(token.userId) },
          select: { id: true, image: true, email: true },
        });
        if (!dbUser) {
          return {};
        }
        token.picture = dbUser.image ?? null;
      }
      if (trigger === "update" && session?.orgId && token.userId) {
        const membership = await prisma.organizationMembership.findUnique({
          where: {
            userId_orgId: {
              userId: String(token.userId),
              orgId: String(session.orgId),
            },
          },
          select: { orgId: true, role: true },
        });
        if (membership) {
          token.orgId = membership.orgId;
          token.role = membership.role;
        }
      }
      if (token.userId && !token.orgId) {
        const membership = await prisma.organizationMembership.findFirst({
          where: { userId: String(token.userId) },
          orderBy: { createdAt: "desc" },
        });
        token.orgId = membership?.orgId ?? null;
        token.role = membership?.role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = String(token.userId);
        session.user.orgId = token.orgId ? String(token.orgId) : null;
        session.user.role = token.role ? String(token.role) : null;
        session.user.image = token.picture ? String(token.picture) : null;
      }
      return session;
    },
  },
});
