import { requireRole } from "@/lib/auth";
import { listClaims, submitClaim } from "@/lib/claims";
import { claimInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";
import { roles } from "@/types";
export const GET = () => api(async () => json({ cases: await listClaims(await requireRole(roles)) }));
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN", "HELPER"]);
  const result = await submitClaim(actor, await readJson(request, claimInput));
  return json(result, result.replayed ? 200 : 201);
});
