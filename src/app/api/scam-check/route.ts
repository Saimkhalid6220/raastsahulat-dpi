import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { imagePayloadLimit, scamInput } from "@/lib/contracts";
import { ScamReport } from "@/lib/db";
import { scanDocument } from "@/lib/documentScanner";
import { api, json, readJson } from "@/lib/http";
import { classifyDocument, classifyScam, sanitizeMessage } from "@/lib/scamShield";

export const GET = () => api(async () => {
  const actor = await requireRole(["CITIZEN", "HELPER", "OFFICER"]);
  const reports = await ScamReport.find({ tenantId: actor.tenantId, reporterUserId: actor.id, reviewStatus: { $exists: true } })
    .select("channel reviewStatus reviewVerdict createdAt").sort({ createdAt: -1 }).limit(10).lean();
  return json({ reports });
});

export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN", "HELPER", "OFFICER"]);
  const input = await readJson(request, scamInput, imagePayloadLimit);
  const classification = input.documentImage ? classifyDocument(await scanDocument(input.documentImage)) : classifyScam(input);
  const needsReview = classification.verdict === "UNSURE" || classification.confidence < 0.92;
  const report = await ScamReport.create({
    tenantId: actor.tenantId, reporterUserId: actor.id, channel: input.channel,
    rawContent: input.documentImage ? "Synthetic document scan" : sanitizeMessage(input.rawContent),
    senderHeader: !input.documentImage && input.senderHeader ? sanitizeMessage(input.senderHeader) : undefined,
    ...classification, ...(needsReview ? { reviewStatus: "PENDING" } : {}),
  });
  await logAudit(actor, "SCAM_CHECKED", "ScamReport", report.id, {
    channel: input.channel, verdict: classification.verdict, flags: classification.redFlags, confidence: classification.confidence,
    routedToHuman: needsReview,
  });
  return json({ id: report.id, ...classification, needsReview }, 201);
});
