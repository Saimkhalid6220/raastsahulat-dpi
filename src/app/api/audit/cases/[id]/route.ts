import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/auditLogger";
import { caseSummary } from "@/lib/claims";
import { hasActiveConsent } from "@/lib/consentGuard";
import { objectId } from "@/lib/contracts";
import { ReliefCase } from "@/lib/db";
import { api, ApiError, json } from "@/lib/http";

export const GET = (_request: Request, { params }: { params: Promise<{ id: string }> }) => api(async () => {
  const actor = await requireRole(["AUDITOR"]);
  const id = objectId.parse((await params).id);
  const record = await ReliefCase.findOne({ _id: id, tenantId: actor.tenantId })
    .select("-extractedDocData -submissionHash -idempotencyKey -officerReview").lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  const citizenId = record.citizenId.toString();
  const [identity, registry] = await Promise.all([
    hasActiveConsent(citizenId, "NADRA_IDENTITY", actor), hasActiveConsent(citizenId, "BISP_POVERTY_SCORE", actor),
  ]);
  const trace = record.aiDecision?.auditorTrace;
  const inputs = trace?.inputs;
  const summary = caseSummary(record);
  const redacted = !identity || !registry;
  await logAudit(actor, "AUDITOR_TRACE_READ", "ReliefCase", id, { identityRedacted: !identity, registryRedacted: !registry });
  return json({
    ...summary,
    ...(redacted && summary.decision ? { decision: { action: summary.decision.action, reasons: ["CONSENT_REDACTED"] } } : {}),
    ruleSnapshot: record.appliedRuleSnapshot,
    auditorTrace: trace && {
      modelId: trace.modelId, ruleVersion: trace.ruleVersion, threshold: trace.threshold,
      latencyMs: trace.latencyMs, tokenCost: trace.tokenCost, action: trace.action,
      redactedScopes: [...(!identity ? ["NADRA_IDENTITY"] : []), ...(!registry ? ["BISP_POVERTY_SCORE"] : [])],
      inputs: inputs && {
        amount: inputs.amount, fraudSurge: inputs.fraudSurge,
        ...(identity ? { nadraOnline: inputs.nadraOnline, nameScore: inputs.nameScore, cnicMatches: inputs.cnicMatches,
          ocrConfidence: inputs.ocrConfidence, tamperScore: inputs.tamperScore, qrValid: inputs.qrValid } : {}),
      },
      ...(identity ? { fieldConfidence: trace.fieldConfidence, documentSource: trace.documentSource, documentIssue: trace.documentIssue } : {}),
      ...(registry ? { eligibilityFailures: trace.eligibilityFailures } : {}),
    },
  });
});
