import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { profileCorrection } from "@/lib/contracts";
import { CitizenProfile } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { phoneticKey } from "@/lib/phonetic";

const fields = "fullNameRaw district householdIncomePKR isWidowOrDisabled";

export const GET = () => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const profile = await CitizenProfile.findOne({ userId: actor.id }).select(fields).lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  return json(profile);
});

export const PATCH = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const { householdIncomePKR, ...input } = await readJson(request, profileCorrection);
  const profile = await CitizenProfile.findOneAndUpdate({ userId: actor.id }, {
    $set: { ...input, phoneticKey: phoneticKey(input.fullNameRaw), ...(householdIncomePKR === null ? {} : { householdIncomePKR }) },
    ...(householdIncomePKR === null ? { $unset: { householdIncomePKR: 1 } } : {}),
  }, { new: true, runValidators: true }).select(fields).lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  await logAudit(actor, "CITIZEN_PROFILE_CORRECTED", "CitizenProfile", profile._id.toString());
  return json(profile);
});
