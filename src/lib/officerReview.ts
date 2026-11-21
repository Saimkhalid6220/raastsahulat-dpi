import type { Actor } from "../types";
import { logAudit } from "./auditLogger";
import { findCase, caseSummary } from "./claims";
import { attemptPayment } from "./claimEvaluation";
import { ReliefCase } from "./db";
import { ApiError } from "./http";
import { sanitizeMessage } from "./scamShield";

type Review = { decision: "APPROVE" | "REJECT" | "REQUEST_MORE_PROOF"; notes: string };
const statuses = { APPROVE: "HUMAN_APPROVED", REJECT: "HUMAN_REJECTED", REQUEST_MORE_PROOF: "NEEDS_MORE_PROOF" } as const;

export async function reviewCase(actor: Actor, id: string, input: Review) {
  const record = await findCase(actor, id);
  if (!["ESCALATED_HUMAN", "NEEDS_MORE_PROOF"].includes(record.status)) throw new ApiError(409, "CASE_NOT_IN_REVIEW");
  const officerReview = { officerId: actor.id, decision: input.decision, notes: sanitizeMessage(input.notes), reviewedAt: new Date() };
  const updated = await ReliefCase.findOneAndUpdate(
    { _id: id, tenantId: actor.tenantId, status: record.status, "officerReview.reviewedAt": record.officerReview?.reviewedAt ?? null },
    { status: statuses[input.decision], officerReview }, { new: true },
  ).lean();
  if (!updated) throw new ApiError(409, "CASE_ALREADY_REVIEWED");
  const actions = { APPROVE: "OFFICER_APPROVED", REJECT: "OFFICER_REJECTED", REQUEST_MORE_PROOF: "OFFICER_REQUESTED_MORE_PROOF" };
  await logAudit(actor, actions[input.decision], "ReliefCase", id, { notes: officerReview.notes });
  if (input.decision === "APPROVE") await attemptPayment(actor, record.caseNumber);
  const current = await ReliefCase.findById(id).orFail().lean();
  return { ...caseSummary(current), officerReview: current.officerReview };
}
