import { requireRole } from "@/lib/auth";
import { caseSummary } from "@/lib/claims";
import { objectId } from "@/lib/contracts";
import { ReliefCase } from "@/lib/db";
import { api, ApiError, json } from "@/lib/http";

export const GET = (_request: Request, { params }: { params: Promise<{ id: string }> }) => api(async () => {
  const actor = await requireRole(["AUDITOR"]);
  const id = objectId.parse((await params).id);
  const record = await ReliefCase.findOne({ _id: id, tenantId: actor.tenantId })
    .select("-extractedDocData -submissionHash -idempotencyKey -officerReview").lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  return json({ ...caseSummary(record), ruleSnapshot: record.appliedRuleSnapshot, auditorTrace: record.aiDecision?.auditorTrace });
});
