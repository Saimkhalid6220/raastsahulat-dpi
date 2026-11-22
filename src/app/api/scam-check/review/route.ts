import { z } from "zod";
import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { objectId } from "@/lib/contracts";
import { ScamReport } from "@/lib/db";
import { api, ApiError, json, readJson } from "@/lib/http";
import { verdicts } from "@/types";

const review = z.object({ id: objectId, verdict: z.enum(verdicts) }).strict();

export const GET = () => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const reports = await ScamReport.find({ tenantId: actor.tenantId, reviewStatus: "PENDING" }).sort({ createdAt: 1 })
    .limit(40).select("channel +rawContent senderHeader redFlags confidence createdAt").lean();
  await logAudit(actor, "SCAM_REVIEW_QUEUE_READ", "ScamReport", actor.tenantId, { count: reports.length });
  return json({ reports });
});

export const PATCH = (request: Request) => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const { id, verdict } = await readJson(request, review);
  const report = await ScamReport.findOneAndUpdate({ _id: id, tenantId: actor.tenantId, reviewStatus: "PENDING" }, {
    reviewStatus: "REVIEWED", reviewVerdict: verdict, reviewedBy: actor.id, reviewedAt: new Date(),
  }).lean();
  if (!report) throw new ApiError(409, "SCAM_REVIEW_NOT_PENDING");
  await logAudit(actor, "SCAM_REVIEWED", "ScamReport", id, { originalVerdict: report.verdict, officerVerdict: verdict });
  return json({ status: "REVIEWED" });
});
