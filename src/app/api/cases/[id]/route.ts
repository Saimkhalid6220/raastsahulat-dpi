import { requireRole } from "@/lib/auth";
import { caseSummary, findCase } from "@/lib/claims";
import { objectId, officerInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";
import { reviewCase } from "@/lib/officerReview";
import { roles } from "@/types";
type Context = { params: Promise<{ id: string }> };
export const GET = (_request: Request, context: Context) => api(async () => {
  const actor = await requireRole(roles);
  const detail = await findCase(actor, objectId.parse((await context.params).id));
  return json({
    ...caseSummary(detail), document: detail.extractedDocData, officerReview: detail.officerReview,
    ...(["OFFICER", "ADMIN", "AUDITOR"].includes(actor.role) ? {
      auditorTrace: detail.aiDecision?.auditorTrace, ruleSnapshot: detail.appliedRuleSnapshot,
    } : {}),
  });
});
export const PATCH = (request: Request, context: Context) => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const id = objectId.parse((await context.params).id);
  return json(await reviewCase(actor, id, await readJson(request, officerInput)));
});
