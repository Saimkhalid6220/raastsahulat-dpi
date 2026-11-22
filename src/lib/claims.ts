import { randomUUID } from "node:crypto";
import type { Actor } from "../types";
import type { CaseContinuation, ClaimInput } from "./contracts";
import { attemptPayment, evaluateCase } from "./claimEvaluation";
import { logAudit } from "./auditLogger";
import { assertActiveConsent, ownCitizenId } from "./consentGuard";
import { sha256 } from "./crypto";
import { ReliefCase, connectDB, type IReliefCase } from "./db";
import { assertDelegated } from "./delegation";
import { scanDocument } from "./documentScanner";
import { ApiError, duplicateKey } from "./http";
import { syntheticDocument } from "./syntheticScan";

export function caseSummary(record: IReliefCase & { _id: unknown }) {
  return {
    id: String(record._id), caseNumber: record.caseNumber, status: record.status, amount: record.requestedAmountPKR,
    citizenId: record.citizenId.toString(), createdAt: record.createdAt, ruleVersion: record.appliedRuleVersion,
    transactionId: record.disbursementTxId, paymentError: record.paymentError,
    assignedOfficerId: record.assignedOfficerId?.toString(), closedAt: record.closedAt, closedOutcome: record.closedOutcome,
    decision: record.aiDecision && {
      action: record.aiDecision.action, confidence: record.aiDecision.confidence, riskScore: record.aiDecision.riskScore,
      reasons: record.aiDecision.uncertaintyReasons, en: record.aiDecision.citizenExplanationEn,
      ur: record.aiDecision.citizenExplanationUr,
    },
  };
}

export async function submitClaim(actor: Actor, input: ClaimInput, external = false) {
  await connectDB();
  const citizenId = actor.role === "CITIZEN" ? await ownCitizenId(actor) : input.citizenId;
  if (!citizenId || (input.citizenId && input.citizenId !== citizenId)) throw new ApiError(403, "CITIZEN_ACCESS_DENIED");
  if (actor.role === "HELPER") await assertDelegated(actor, citizenId, input.delegationToken);
  if (!input.draft || input.extractedDocData || input.documentImage) {
    await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  }
  if (!input.draft) await assertActiveConsent(citizenId, "BISP_POVERTY_SCORE", actor);
  const idempotencyKey = input.idempotencyKey && sha256(`${actor.tenantId}:${actor.id}:${input.idempotencyKey}`);
  const submissionHash = sha256(JSON.stringify({
    citizenId, draft: input.draft, amount: input.requestedAmountPKR, doc: input.extractedDocData,
    image: input.documentImage && sha256(input.documentImage),
  }));
  const replay = async () => {
    if (!idempotencyKey) return null;
    const previous = await ReliefCase.findOne({ idempotencyKey }).lean();
    if (!previous) return null;
    if (previous.submissionHash !== submissionHash) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED");
    if (previous.status === "AI_REVIEW") await evaluateCase(actor, previous.caseNumber);
    if (previous.status === "AUTO_APPROVED") await attemptPayment(actor, previous.caseNumber);
    const latest = await ReliefCase.findById(previous._id).orFail().lean();
    return { record: caseSummary(latest), replayed: true };
  };
  const previous = await replay();
  if (previous) return previous;
  const fixture = input.extractedDocData;
  const extractedDocData = input.documentImage && !input.draft ? await scanDocument(input.documentImage) :
    fixture && actor.role !== "CITIZEN" && fixture.cnic && fixture.name && fixture.documentFixture
      ? { ...syntheticDocument(fixture.cnic, fixture.name, fixture.documentFixture), source: "MOCK_FIXTURE" }
      : fixture && { cnic: fixture.cnic, name: fixture.name, source: "UNVERIFIED" };
  try {
    const created = await ReliefCase.create({
      caseNumber: `RS-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`,
      ...(idempotencyKey ? { idempotencyKey, submissionHash } : {}),
      tenantId: actor.tenantId, citizenId, submittedByUserId: actor.id,
      submissionChannel: external ? "PUBLIC_API" : actor.role === "HELPER" ? "HELPER_OFFLINE_SYNC" : "CITIZEN_WEB",
      requestedAmountPKR: input.requestedAmountPKR, extractedDocData,
      status: input.draft ? "DRAFT" : "AI_REVIEW",
    });
    await logAudit(actor, "CASE_CREATED", "ReliefCase", created.id, { channel: created.submissionChannel });
    if (input.draft) return { record: caseSummary(created), replayed: false };
    await evaluateCase(actor, created.caseNumber);
    return { record: caseSummary(await ReliefCase.findById(created.id).orFail().lean()), replayed: false };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const previous = await replay();
    if (!previous) throw error;
    return previous;
  }
}

export async function continueClaim(actor: Actor, id: string, input: CaseContinuation) {
  const citizenId = await ownCitizenId(actor);
  const query = { _id: id, tenantId: actor.tenantId, citizenId };
  const key = sha256(`${actor.id}:${input.idempotencyKey}`);
  const hash = sha256(JSON.stringify([input.requestedAmountPKR, input.documentImage]));
  const record = await ReliefCase.findOne(query).lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  await assertActiveConsent(citizenId, "BISP_POVERTY_SCORE", actor);
  const replay = record.continuations?.find((entry) => entry.key === key);
  if (replay && replay.hash !== hash) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED");
  if (!replay) {
    if (record.status !== "DRAFT" && record.status !== "NEEDS_MORE_PROOF") throw new ApiError(409, "CASE_CANNOT_BE_RESUMED");
    const additionalProof = record.status === "NEEDS_MORE_PROOF";
    if (additionalProof && input.requestedAmountPKR !== record.requestedAmountPKR) throw new ApiError(409, "PROOF_AMOUNT_CHANGED");
    const extractedDocData = await scanDocument(input.documentImage);
    const updated = await ReliefCase.updateOne({ ...query, status: record.status, "continuations.key": { $ne: key }, updatedAt: record.updatedAt }, {
      $set: { status: "AI_REVIEW", additionalProof, requestedAmountPKR: input.requestedAmountPKR, extractedDocData },
      $push: { continuations: { key, hash } },
    });
    if (!updated.modifiedCount) {
      const latest = await ReliefCase.findOne(query).select("continuations").lean();
      const matching = latest?.continuations?.find((entry) => entry.key === key);
      if (!matching || matching.hash !== hash) throw new ApiError(409, "CASE_CHANGED");
    } else {
      await logAudit(actor, additionalProof ? "CASE_PROOF_RESUBMITTED" : "CASE_DRAFT_SUBMITTED", "ReliefCase", id);
    }
  }
  await evaluateCase(actor, record.caseNumber);
  if (replay && record.status === "AUTO_APPROVED") await attemptPayment(actor, record.caseNumber);
  const latest = await ReliefCase.findOne(query).orFail().lean();
  return { record: caseSummary(latest), replayed: Boolean(replay) };
}

export async function listClaims(actor: Actor, resolved = false) {
  await connectDB();
  const restriction = actor.role === "CITIZEN" ? { citizenId: await ownCitizenId(actor) } :
    actor.role === "HELPER" ? { submittedByUserId: actor.id } : {};
  const query = ReliefCase.find({ tenantId: actor.tenantId, ...restriction })
    .select("-extractedDocData -aiDecision.auditorTrace -appliedRuleSnapshot -officerReview -submissionHash -idempotencyKey");
  if (actor.role === "OFFICER") {
    query.where("status").in(resolved ? ["HUMAN_REJECTED", "DISBURSED", "CLOSED"] : ["ESCALATED_HUMAN", "NEEDS_MORE_PROOF", "HUMAN_APPROVED", "AUTO_APPROVED"]);
    query.sort(resolved ? { updatedAt: -1 } : { "aiDecision.confidence": 1, createdAt: 1 });
  } else {
    query.sort({ createdAt: -1 });
  }
  const records = (await query.limit(40).lean()).map(caseSummary);
  return actor.role === "OFFICER" ?
    records.sort((a, b) => Number(b.status === "ESCALATED_HUMAN") - Number(a.status === "ESCALATED_HUMAN")) : records;
}

export async function findCase(actor: Actor, id: string) {
  const ownership = actor.role === "CITIZEN" ? { citizenId: await ownCitizenId(actor) } :
    actor.role === "HELPER" ? { submittedByUserId: actor.id } : {};
  const query = { _id: id, tenantId: actor.tenantId, ...ownership };
  const record = await ReliefCase.findOne(query).select("citizenId").lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  const cid = record.citizenId.toString();
  if (actor.role === "HELPER") await assertActiveConsent(cid, "HELPER_DELEGATION", actor);
  await assertActiveConsent(cid, "NADRA_IDENTITY", actor);
  await assertActiveConsent(cid, "BISP_POVERTY_SCORE", actor);
  const detail = await ReliefCase.findOne(query).select("-idempotencyKey -submissionHash -continuations").lean();
  if (!detail) throw new ApiError(404, "CASE_NOT_FOUND");
  return detail;
}
