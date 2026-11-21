import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { scamInput } from "@/lib/contracts";
import { ScamReport } from "@/lib/db";
import { api, json, readJson } from "@/lib/http";
import { classifyScam, sanitizeMessage } from "@/lib/scamShield";

export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["CITIZEN", "HELPER", "OFFICER"]);
  const input = await readJson(request, scamInput);
  const classification = classifyScam(input);
  const report = await ScamReport.create({
    tenantId: actor.tenantId, reporterUserId: actor.id, channel: input.channel,
    rawContent: sanitizeMessage(input.rawContent), senderHeader: input.senderHeader && sanitizeMessage(input.senderHeader),
    ...classification,
  });
  await logAudit(actor, "SCAM_CHECKED", "ScamReport", report.id, {
    channel: input.channel, verdict: classification.verdict, flags: classification.redFlags,
  });
  return json({ id: report.id, ...classification }, 201);
});
