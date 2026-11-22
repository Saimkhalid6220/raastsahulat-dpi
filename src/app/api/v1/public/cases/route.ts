import { authenticateApiKey } from "@/lib/auth";
import { submitClaim } from "@/lib/claims";
import { claimInput, imagePayloadLimit } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";
export const POST = (request: Request) => api(async () => {
  const actor = await authenticateApiKey(request);
  const result = await submitClaim(actor, await readJson(request, claimInput, imagePayloadLimit), true);
  return json(result, result.replayed ? 200 : 201);
});
