import { requireRole } from "@/lib/auth";
import { ownCitizenId } from "@/lib/consentGuard";
import { sampleInput } from "@/lib/contracts";
import { CitizenProfile } from "@/lib/db";
import { renderSyntheticCard } from "@/lib/documentScanner";
import { api, ApiError, json, readJson } from "@/lib/http";

export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const { name, variant } = await readJson(request, sampleInput);
  const profile = await CitizenProfile.findById(await ownCitizenId(actor)).select("cnicNormalized").lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  return json({ image: await renderSyntheticCard(profile.cnicNormalized, name, variant) });
});
