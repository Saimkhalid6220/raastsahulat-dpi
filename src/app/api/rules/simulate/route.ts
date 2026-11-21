import { requireRole } from "@/lib/auth";
import { ruleInput } from "@/lib/contracts";
import { simulateRule } from "@/lib/digitalTwin";
import { api, json, readJson } from "@/lib/http";
import { conditionSchema } from "@/lib/ruleEngine";

export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const draft = await readJson(request, ruleInput.extend({ conditions: conditionSchema().optional() }));
  return json(await simulateRule(actor.tenantId, draft));
});
