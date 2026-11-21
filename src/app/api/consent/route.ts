import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { ownCitizenId } from "@/lib/consentGuard";
import { consentChange } from "@/lib/contracts";
import { CitizenProfile, ConsentRecord } from "@/lib/db";
import { api, ApiError, duplicateKey, json, readJson } from "@/lib/http";
import type { Actor, ConsentScope } from "@/types";

async function target(actor: Actor, scope: ConsentScope) {
  const citizenId = await ownCitizenId(actor);
  if (scope !== "HELPER_DELEGATION") {
    return { citizenId, granteeType: "DEPARTMENT", granteeId: actor.tenantId, scopes: scope };
  }
  const citizen = await CitizenProfile.findById(citizenId).select("assignedHelperId").lean();
  if (!citizen?.assignedHelperId) throw new ApiError(404, "HELPER_NOT_ASSIGNED");
  return { citizenId, granteeType: "HELPER", granteeId: citizen.assignedHelperId.toString(), scopes: scope };
}

export const GET = () => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const citizenId = await ownCitizenId(actor);
  const records = await ConsentRecord.find({ citizenId }).sort({ grantedAt: -1 }).limit(50).lean();
  return json({ citizenId, records });
});
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const { scope } = await readJson(request, consentChange);
  const filter = { ...await target(actor, scope), status: "ACTIVE" };
  if (await ConsentRecord.exists(filter)) return json({ status: "ACTIVE" });
  try {
    const created = await ConsentRecord.create({ ...filter, scopes: [scope], grantedAt: new Date() });
    await logAudit(actor, "CONSENT_GRANTED", "ConsentRecord", created.id, { scope, citizenId: filter.citizenId });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
  }
  return json({ status: "ACTIVE" }, 201);
});
export const DELETE = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const { scope } = await readJson(request, consentChange);
  const filter = await target(actor, scope);
  const revoked = await ConsentRecord.findOneAndUpdate({ ...filter, status: "ACTIVE" }, {
    status: "REVOKED", revokedAt: new Date(), revocationReason: "WITHDRAWN_BY_CITIZEN",
  }, { new: true }).lean();
  if (revoked) {
    await logAudit(actor, "CONSENT_REVOKED", "ConsentRecord", revoked._id.toString(), {
      scope, citizenId: filter.citizenId, revokedAt: revoked.revokedAt,
    });
  }
  return json({ status: "REVOKED" });
});
