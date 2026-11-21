import { requireRole } from "@/lib/auth";
import { ReliefCase, ScamReport } from "@/lib/db";
import { api, json } from "@/lib/http";
import { classifyScam } from "@/lib/scamShield";

export const GET = () => api(async () => {
  const { tenantId } = await requireRole(["AUDITOR"]);
  const [decisions, samples] = await Promise.all([
    ReliefCase.aggregate<{ _id: string; count: number; totalLatency: number }>([
      { $match: { tenantId, aiDecision: { $exists: true } } },
      { $group: { _id: "$aiDecision.action", count: { $sum: 1 }, totalLatency: { $sum: "$aiDecision.auditorTrace.latencyMs" } } },
    ]),
    ScamReport.find({ tenantId, groundTruthLabel: { $exists: true } }).select("channel senderHeader groundTruthLabel +rawContent").lean(),
  ]);
  let tp = 0, fp = 0, fn = 0, tn = 0, unsure = 0;
  for (const sample of samples) {
    const result = classifyScam({ rawContent: sample.rawContent, senderHeader: sample.senderHeader ?? undefined, channel: sample.channel });
    if (result.verdict === "UNSURE") unsure++;
    if (sample.groundTruthLabel === "SCAM") {
      if (result.verdict === "SCAM") tp++;
      else fn++;
    } else if (result.verdict === "SCAM") fp++;
    else if (result.verdict === "LEGITIMATE") tn++;
  }
  const evaluated = decisions.reduce((total, row) => total + row.count, 0);
  const rate = (value: number, denominator: number) => denominator ? value / denominator : null;
  return json({
    evaluated,
    autoApprovalRate: rate(decisions.find((row) => row._id === "AUTO_APPROVED")?.count ?? 0, evaluated),
    humanEscalationRate: rate(decisions.find((row) => row._id === "ESCALATED_HUMAN")?.count ?? 0, evaluated),
    avgLatencyMs: rate(decisions.reduce((total, row) => total + row.totalLatency, 0), evaluated),
    scam: { samples: samples.length, tp, fp, fn, tn, unsure, precision: rate(tp, tp + fp), recall: rate(tp, tp + fn),
      falseAlarmRate: rate(fp, samples.length - tp - fn) },
  });
});
