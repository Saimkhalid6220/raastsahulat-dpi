import { randomBytes } from "node:crypto";
import { z } from "zod";
import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { objectId } from "@/lib/contracts";
import { sha256 } from "@/lib/crypto";
import { User } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";

const change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-active"), userId: objectId, active: z.boolean() }).strict(),
  z.object({ action: z.literal("rotate-key") }).strict(),
]);

export const GET = () => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const accounts = await User.find({ tenantId: actor.tenantId }).select("name email role isActive").sort("role").limit(60).lean();
  return json({ accounts });
});

export const PATCH = (request: Request) => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const input = await readJson(request, change);
  if (input.action === "rotate-key") {
    const apiKey = `rs_demo_${randomBytes(24).toString("base64url")}`;
    await User.updateOne({ _id: actor.id, tenantId: actor.tenantId }, { apiKeyHash: sha256(apiKey) });
    await logAudit(actor, "API_KEY_ROTATED", "User", actor.id);
    return json({ apiKey });
  }
  if (actor.id === input.userId) throw new ApiError(409, "CANNOT_CHANGE_OWN_STATUS");
  const account = await User.findOneAndUpdate(
    { _id: input.userId, tenantId: actor.tenantId }, { isActive: input.active }, { new: true },
  ).select("name email role isActive").lean();
  if (!account) throw new ApiError(404, "ACCOUNT_NOT_FOUND");
  await logAudit(actor, "ACCOUNT_STATUS_CHANGED", "User", input.userId, { active: input.active });
  return json({ account });
});
