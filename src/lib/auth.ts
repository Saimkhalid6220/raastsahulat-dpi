import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { roles, type Actor, type UserRole } from "../types";
import { logAudit } from "./auditLogger";
import { authConfig } from "./auth.config";
import { emailAddress } from "./contracts";
import { connectDB, User } from "./db";
import { sha256, verifyPassword } from "./crypto";
import { ApiError } from "./http";

const credentialsSchema = z.object({
  email: emailAddress,
  password: z.string().min(1).max(100),
  role: z.enum(roles).optional(),
});
const fallbackHash = `00000000000000000000000000000000:${"0".repeat(64)}`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(input) {
        const result = credentialsSchema.safeParse(input);
        if (!result.success) return null;
        await connectDB();
        const { email, password, role } = result.data;
        const user = await User.findOne({ email, isActive: true }).select("+passwordHash").lean();
        if (!await verifyPassword(password, user?.passwordHash ?? fallbackHash) || !user) return null;
        if (role && role !== user.role) return null;
        await logAudit({ id: user._id.toString(), role: user.role, tenantId: user.tenantId }, "SIGNED_IN", "User", user._id.toString());
        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, tenantId: user.tenantId };
      },
    }),
  ],
});

export async function requireRole(roles: readonly UserRole[]): Promise<Actor> {
  const session = await auth();
  if (!session?.user.id) throw new ApiError(401, "UNAUTHENTICATED");
  await connectDB();
  const user = await User.findOne({ _id: session.user.id, isActive: true }).select("role tenantId").lean();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED");
  if (!roles.includes(user.role)) throw new ApiError(403, "FORBIDDEN");
  return { id: user._id.toString(), role: user.role, tenantId: user.tenantId };
}

export async function authenticateApiKey(request: Request): Promise<Actor> {
  const key = request.headers.get("x-api-key");
  if (!key || key.length > 256) throw new ApiError(401, "INVALID_API_KEY");
  await connectDB();
  const account = await User.findOne({ apiKeyHash: sha256(key), isActive: true, role: "ADMIN" }).select("role tenantId").lean();
  if (!account) throw new ApiError(401, "INVALID_API_KEY");
  return { id: account._id.toString(), role: account.role, tenantId: account.tenantId };
}
