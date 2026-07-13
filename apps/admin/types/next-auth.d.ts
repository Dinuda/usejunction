import "next-auth";
import "next-auth/jwt";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string | null;
      role: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    orgId?: string | null;
    role?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    orgId?: string | null;
    role?: string | null;
  }
}
