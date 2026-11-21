import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { objectId } from "@/lib/contracts";
import { ownCitizenId } from "@/lib/consentGuard";
import { api, ApiError, json, readJson } from "@/lib/http";
import { lookupBisp } from "@/lib/mockRails";
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN", "OFFICER", "ADMIN"]);
  const { citizenId } = await readJson(request, z.object({ citizenId: objectId }).strict());
  if (actor.role === "CITIZEN" && citizenId !== await ownCitizenId(actor)) throw new ApiError(403, "CITIZEN_ACCESS_DENIED");
  return json(await lookupBisp(actor, citizenId));
});
