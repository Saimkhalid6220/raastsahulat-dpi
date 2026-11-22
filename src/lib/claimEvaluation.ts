import { performance } from "node:perf_hooks";
import type { Actor } from "../types";
import { logAudit } from "./auditLogger";
import { routeConfidence } from "./confidenceRouter";
import { assertActiveConsent } from "./consentGuard";
import { ReliefCase } from "./db";
import { ApiError } from "./http";
import { disburse, lookupBisp, readConfig, verifyNadra } from "./mockRails";
import { activeRule } from "./ruleEngine";

export async function attemptPayment(actor: Actor, caseNumber: string) {
  try {
    await disburse(actor, caseNumber);
  } catch (error) {
    if (!(error instanceof ApiError) || !["RAAST_OFFLINE", "CONSENT_REVOKED", "AMOUNT_EXCEEDS_RULE_CAP"].includes(error.code)) throw error;
    const blocked = await ReliefCase.findOneAndUpdate(
      { caseNumber, tenantId: actor.tenantId, status: { $in: ["AUTO_APPROVED", "HUMAN_APPROVED"] } },
      { paymentError: error.code },
    ).select("_id").lean();
    if (blocked) await logAudit(actor, "RAAST_PAYMENT_BLOCKED", "ReliefCase", blocked._id.toString(), { reason: error.code });
  }
}

export async function evaluateCase(actor: Actor, caseNumber: string) {
  const query = { tenantId: actor.tenantId, caseNumber };
  const candidate = await ReliefCase.findOne(query).select("citizenId status").orFail().lean();
  if (candidate.status !== "AI_REVIEW") return;
  const start = performance.now();
  const citizenId = candidate.citizenId.toString();
  await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  const record = await ReliefCase.findOne(query).orFail().lean();
  const doc = record.extractedDocData;
  const [registry, nadra, config, rule, repeated] = await Promise.all([
    lookupBisp(actor, citizenId),
    verifyNadra(actor, citizenId, doc?.cnic ?? undefined, doc?.name ?? undefined),
    readConfig(actor.tenantId),
    activeRule(actor.tenantId),
    ReliefCase.exists({
      tenantId: actor.tenantId, citizenId, _id: { $ne: record._id }, status: { $ne: "DRAFT" },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    }),
  ]);
  const ocr = doc?.documentFixture === "BLURRY" ? Math.min(doc.ocrConfidence ?? 0.5, 0.6) : doc?.ocrConfidence;
  const tamper = doc?.documentFixture === "TAMPERED" ? Math.max(doc.tamperScore ?? 0, 0.85) : doc?.tamperScore;
  const inputs = {
    ...registry, amount: record.requestedAmountPKR, nadraOnline: nadra.online,
    nadraReason: nadra.online ? undefined : nadra.reason,
    cnicMatches: nadra.online && nadra.cnicMatches, nameScore: nadra.online ? nadra.score : 0,
    rawNameScore: nadra.online ? nadra.rawScore : 0, ocrConfidence: ocr ?? 0,
    tamperScore: tamper ?? 0, qrValid: doc?.qrValid === true, repeatedClaim: Boolean(repeated),
    fraudSurge: config.fraudSurge ?? false,
    additionalProof: record.additionalProof ?? false,
  };
  const decision = routeConfidence(inputs, rule);
  const auditorTrace = {
    modelId: "raastsahulat-deterministic-v1", ruleVersion: rule?.version ?? null,
    prompt: null, inputs, threshold: rule?.minAutoConfidence ?? 0.92,
    fieldConfidence: { ocr: inputs.ocrConfidence, name: inputs.nameScore, cnic: Number(inputs.cnicMatches) },
    latencyMs: Math.round(performance.now() - start), tokenCost: 0,
    documentSource: doc?.source, documentIssue: doc?.scanIssue,
    action: decision.action, eligibilityFailures: decision.eligibilityFailures,
  };
  const evaluated = await ReliefCase.findOneAndUpdate(
    { ...query, status: "AI_REVIEW" },
    {
      status: decision.action, aiDecision: { ...decision, auditorTrace },
      appliedRuleVersion: rule?.version, appliedRuleSnapshot: rule,
    },
  ).select("_id").lean();
  if (!evaluated) return;
  await logAudit(actor, "AI_EVALUATED", "ReliefCase", evaluated._id.toString(), {
    action: decision.action, ruleVersion: rule?.version ?? null, confidence: decision.confidence, riskScore: decision.riskScore,
  });
  if (decision.action === "AUTO_APPROVED") await attemptPayment(actor, caseNumber);
}
