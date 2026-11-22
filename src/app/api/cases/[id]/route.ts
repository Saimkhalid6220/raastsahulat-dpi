import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/auditLogger";
import { caseSummary, continueClaim, findCase } from "@/lib/claims";
import { caseContinuation, caseManagement, imagePayloadLimit, objectId, officerInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";
import { manageCase, reviewCase } from "@/lib/officerReview";
import { roles } from "@/types";
type Context = { params: Promise<{ id: string }> };
export const GET = (_request: Request, context: Context) => api(async () => {
  const actor = await requireRole(roles);
  const detail = await findCase(actor, objectId.parse((await context.params).id));
  if (actor.role !== "CITIZEN") await logAudit(actor, "CASE_DETAIL_READ", "ReliefCase", detail._id.toString());
  return json({
    ...caseSummary(detail), document: detail.extractedDocData, officerReview: detail.officerReview,
    ...(["OFFICER", "ADMIN", "AUDITOR"].includes(actor.role) ? {
      auditorTrace: detail.aiDecision?.auditorTrace, ruleSnapshot: detail.appliedRuleSnapshot,
    } : {}),
  });
});
export const POST = (request: Request, context: Context) => api(async () => {
  const actor = await requireRole(["CITIZEN"]);
  const id = objectId.parse((await context.params).id);
  return json(await continueClaim(actor, id, await readJson(request, caseContinuation, imagePayloadLimit)));
});
export const PUT = (request: Request, context: Context) => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const id = objectId.parse((await context.params).id);
  return json(await manageCase(actor, id, await readJson(request, caseManagement)));
});
export const PATCH = (request: Request, context: Context) => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const id = objectId.parse((await context.params).id);
  return json(await reviewCase(actor, id, await readJson(request, officerInput)));
});
