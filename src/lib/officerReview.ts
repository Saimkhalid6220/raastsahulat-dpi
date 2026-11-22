import type { Actor } from "../types";
import type { CaseManagement } from "./contracts";
import { logAudit } from "./auditLogger";
import { findCase, caseSummary } from "./claims";
import { attemptPayment } from "./claimEvaluation";
import { ReliefCase, User } from "./db";
import { ApiError } from "./http";
import { sanitizeMessage } from "./scamShield";

type Review = { decision: "APPROVE" | "REJECT" | "REQUEST_MORE_PROOF"; notes: string };
const statuses = { APPROVE: "HUMAN_APPROVED", REJECT: "HUMAN_REJECTED", REQUEST_MORE_PROOF: "NEEDS_MORE_PROOF" } as const;

export async function reviewCase(actor: Actor, id: string, input: Review) {
  const record = await findCase(actor, id);
  if (record.status !== "ESCALATED_HUMAN") throw new ApiError(409, "CASE_NOT_IN_REVIEW");
  await assertAssignee(actor, record);
  const officerReview = { officerId: actor.id, decision: input.decision, notes: sanitizeMessage(input.notes), reviewedAt: new Date() };
  const updated = await ReliefCase.findOneAndUpdate(
    { _id: id, tenantId: actor.tenantId, status: record.status, updatedAt: record.updatedAt },
    { status: statuses[input.decision], officerReview, assignedOfficerId: actor.id }, { new: true },
  ).lean();
  if (!updated) throw new ApiError(409, "CASE_ALREADY_REVIEWED");
  if (!record.assignedOfficerId) await logAudit(actor, "CASE_ASSIGNED", "ReliefCase", id, { officerId: actor.id });
  const actions = { APPROVE: "OFFICER_APPROVED", REJECT: "OFFICER_REJECTED", REQUEST_MORE_PROOF: "OFFICER_REQUESTED_MORE_PROOF" };
  await logAudit(actor, actions[input.decision], "ReliefCase", id, { notes: officerReview.notes });
  if (input.decision === "APPROVE") await attemptPayment(actor, record.caseNumber);
  const current = await ReliefCase.findById(id).orFail().lean();
  return { ...caseSummary(current), officerReview: current.officerReview };
}

async function assertAssignee(actor: Actor, record: { assignedOfficerId?: { toString(): string } | null }) {
  const assigned = record.assignedOfficerId?.toString();
  if (assigned && assigned !== actor.id && await User.exists({ _id: assigned, tenantId: actor.tenantId, role: "OFFICER", isActive: true })) {
    throw new ApiError(403, "CASE_ASSIGNED_TO_ANOTHER_OFFICER");
  }
}

export async function manageCase(actor: Actor, id: string, input: CaseManagement) {
  // Administrative changes use only case metadata. Sensitive detail uses the consent guard in findCase.
  const query = { _id: id, tenantId: actor.tenantId };
  const fields = "status assignedOfficerId closedAt closedOutcome updatedAt";
  const record = await ReliefCase.findOne(query).select(fields).lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  if (input.action === "CLOSE" && record.status === "CLOSED") return caseManagementState(record);
  await assertAssignee(actor, record);
  const current = { ...query, status: record.status, updatedAt: record.updatedAt };
  if (input.action === "ASSIGN") {
    if (!["ESCALATED_HUMAN", "NEEDS_MORE_PROOF"].includes(record.status)) throw new ApiError(409, "CASE_CANNOT_BE_ASSIGNED");
    if (record.assignedOfficerId?.toString() === input.officerId) return caseManagementState(record);
    if (!await User.exists({ _id: input.officerId, tenantId: actor.tenantId, role: "OFFICER", isActive: true })) {
      throw new ApiError(404, "OFFICER_NOT_AVAILABLE");
    }
    const updated = await ReliefCase.findOneAndUpdate(current, { assignedOfficerId: input.officerId }, { new: true }).select(fields).lean();
    if (!updated) throw new ApiError(409, "CASE_CHANGED");
    await logAudit(actor, "CASE_ASSIGNED", "ReliefCase", id, { officerId: input.officerId });
    return caseManagementState(updated);
  }
  if (record.status !== "DISBURSED" && record.status !== "HUMAN_REJECTED") throw new ApiError(409, "CASE_CANNOT_BE_CLOSED");
  const updated = await ReliefCase.findOneAndUpdate(current, {
    status: "CLOSED", closedAt: new Date(), closedBy: actor.id, closedOutcome: record.status,
  }, { new: true }).select(fields).lean();
  if (!updated) throw new ApiError(409, "CASE_CHANGED");
  await logAudit(actor, "CASE_CLOSED", "ReliefCase", id, { outcome: record.status });
  return caseManagementState(updated);
}

function caseManagementState(record: { status: string; assignedOfficerId?: { toString(): string } | null; closedAt?: Date | null; closedOutcome?: string | null }) {
  return { status: record.status, assignedOfficerId: record.assignedOfficerId?.toString(), closedAt: record.closedAt, closedOutcome: record.closedOutcome };
}
