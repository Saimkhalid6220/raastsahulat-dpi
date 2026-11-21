import { requireRole } from "@/lib/auth";
import { ruleInput } from "@/lib/contracts";
import { PolicyRule } from "@/lib/db";
import { api, json, readJson } from "@/lib/http";
import { conditionSchema, publishRule } from "@/lib/ruleEngine";
export const GET = () => api(async () => {
  const actor = await requireRole(["ADMIN", "AUDITOR", "OFFICER"]);
  return json({ rules: await PolicyRule.find({ tenantId: actor.tenantId }).sort({ version: -1 }).limit(20).lean() });
});
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const rule = await readJson(request, ruleInput.extend({ conditions: conditionSchema().optional() }));
  return json({ rule: await publishRule(actor, rule) }, 201);
});
