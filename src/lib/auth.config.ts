import type { DefaultSession, NextAuthConfig } from "next-auth";
import type { UserRole } from "../types";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    tenantId?: string;
  }
  interface Session {
    user: DefaultSession["user"] & { id?: string; role?: UserRole; tenantId?: string };
  }
}

export const portalByRole: Record<UserRole, string> = {
  CITIZEN: "/portal", HELPER: "/helper", OFFICER: "/officer", ADMIN: "/admin", AUDITOR: "/auditor",
};

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 4 * 60 * 60 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub;
      session.user.role = token.role as UserRole | undefined;
      session.user.tenantId = typeof token.tenantId === "string" ? token.tenantId : undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
