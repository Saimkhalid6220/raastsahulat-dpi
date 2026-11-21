import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, portalByRole } from "./lib/auth.config";

export const proxy = NextAuth(authConfig).auth((request) => {
  const { role } = request.auth?.user ?? {};
  if (!role) return NextResponse.redirect(new URL("/login", request.url));
  const portal = portalByRole[role];
  const segment = `/${request.nextUrl.pathname.split("/")[1]}`;
  if (portal !== segment) return NextResponse.redirect(new URL(portal, request.url));
  return NextResponse.next();
});

export const config = { matcher: ["/portal/:path*", "/helper/:path*", "/officer/:path*", "/admin/:path*", "/auditor/:path*"] };
