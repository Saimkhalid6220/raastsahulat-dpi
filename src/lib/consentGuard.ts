import type { Actor, ConsentScope } from "../types";
import { logAudit } from "./auditLogger";
import { CitizenProfile, ConsentRecord, connectDB } from "./db";
import { ApiError } from "./http";

export async function ownCitizenId(actor: Actor) {
  await connectDB();
  const profile = await CitizenProfile.findOne({ userId: actor.id }).select("_id").lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  return profile._id.toString();
}

export async function assertActiveConsent(citizenId: string, scope: ConsentScope, actor: Actor) {
  await connectDB();
  const delegation = scope === "HELPER_DELEGATION";
  const result = await ConsentRecord.exists({
    citizenId, granteeId: delegation ? actor.id : actor.tenantId,
    granteeType: delegation ? "HELPER" : "DEPARTMENT", scopes: scope, status: "ACTIVE",
  });
  if (result) return;
  await logAudit(actor, "CONSENT_BLOCKED_ACCESS", "CitizenProfile", citizenId, { scope });
  throw new ApiError(403, "CONSENT_REVOKED", "Active consent is required for this action.");
}
