import { z } from "zod";
import { routeConfidence, type RouterPolicy } from "./confidenceRouter";
import { ConsentRecord, ReliefCase, connectDB } from "./db";

const inputSchema = z.object({
  amount: z.number().optional(),
  district: z.string(),
  householdIncomePKR: z.number().nullable().default(null),
  isWidowOrDisabled: z.boolean(),
  nadraOnline: z.boolean(),
  nadraReason: z.string().optional(),
  nameScore: z.number(),
  rawNameScore: z.number().default(1),
  cnicMatches: z.boolean().default(true),
  ocrConfidence: z.number(),
  tamperScore: z.number(),
  qrValid: z.boolean().default(true),
  repeatedClaim: z.boolean(),
  fraudSurge: z.boolean().default(false),
  additionalProof: z.boolean().optional(),
});
function totals() {
  return { autoApproved: 0, escalated: 0, rejected: 0, payoutPKR: 0 };
}

export async function simulateRule(tenantId: string, draft: RouterPolicy) {
  await connectDB();
  const before = totals();
  const after = totals();
  let skipped = 0;
  const grants = await ConsentRecord.aggregate<{ _id: { toString(): string } }>([
    { $match: { granteeId: tenantId, granteeType: "DEPARTMENT", status: "ACTIVE", scopes: { $in: ["NADRA_IDENTITY", "BISP_POVERTY_SCORE"] } } },
    { $unwind: "$scopes" },
    { $group: { _id: "$citizenId", scopes: { $addToSet: "$scopes" } } },
    { $match: { scopes: { $all: ["NADRA_IDENTITY", "BISP_POVERTY_SCORE"] } } },
    { $project: { _id: 1 } },
  ]);
  const allowed = new Set(grants.map((grant) => grant._id.toString()));
  const history = ReliefCase.find({ tenantId, aiDecision: { $exists: true } })
    .select("citizenId status closedOutcome requestedAmountPKR aiDecision").lean().cursor();
  for await (const record of history) {
    if (!allowed.has(record.citizenId.toString())) { skipped++; continue; }
    const source = inputSchema.safeParse(record.aiDecision?.auditorTrace?.inputs);
    if (!source.success) {
      skipped++;
      continue;
    }
    if ((record.closedOutcome ?? record.status) === "HUMAN_REJECTED") before.rejected++;
    else if (record.aiDecision?.action === "AUTO_APPROVED") {
      before.autoApproved++;
      before.payoutPKR += record.requestedAmountPKR;
    } else before.escalated++;

    const decision = routeConfidence({ ...source.data, amount: record.requestedAmountPKR }, draft);
    if (decision.action === "AUTO_APPROVED") {
      after.autoApproved++;
      after.payoutPKR += record.requestedAmountPKR;
    } else if (decision.eligibilityFailures.some((reason) => reason !== "INCOME_MISSING")) {
      after.rejected++;
    } else after.escalated++;
  }
  return {
    before, after, skipped, replayed: before.autoApproved + before.escalated + before.rejected,
    delta: { autoApproved: after.autoApproved - before.autoApproved, escalated: after.escalated - before.escalated,
      rejected: after.rejected - before.rejected, payoutPKR: after.payoutPKR - before.payoutPKR },
  };
}
