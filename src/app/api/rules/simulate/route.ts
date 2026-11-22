import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/auditLogger";
import { ruleInput } from "@/lib/contracts";
import { simulateRule } from "@/lib/digitalTwin";
import { api, json, readJson } from "@/lib/http";
import { conditionSchema } from "@/lib/ruleEngine";

export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const draft = await readJson(request, ruleInput.extend({ conditions: conditionSchema().optional() }));
  const result = await simulateRule(actor.tenantId, draft);
  await logAudit(actor, "POLICY_SIMULATED", "PolicyRule", actor.tenantId, { replayed: result.replayed, skipped: result.skipped });
  return json(result);
});
