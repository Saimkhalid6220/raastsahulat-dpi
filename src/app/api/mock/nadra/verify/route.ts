import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/auditLogger";
import { nadraInput } from "@/lib/contracts";
import { ownCitizenId } from "@/lib/consentGuard";
import { api, ApiError, json, readJson } from "@/lib/http";
import { verifyNadra } from "@/lib/mockRails";
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN", "OFFICER", "ADMIN"]);
  const { citizenId, cnic, name } = await readJson(request, nadraInput);
  if (actor.role === "CITIZEN" && citizenId !== await ownCitizenId(actor)) throw new ApiError(403, "CITIZEN_ACCESS_DENIED");
  const result = await verifyNadra(actor, citizenId, cnic, name);
  await logAudit(actor, "MOCK_IDENTITY_CHECKED", "CitizenProfile", citizenId, { online: result.online });
  return result.online ? json(result) : json({ error: "SERVICE_UNAVAILABLE", ...result }, 503);
});
