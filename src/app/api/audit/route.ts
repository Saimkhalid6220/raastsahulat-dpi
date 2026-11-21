import { requireRole } from "@/lib/auth";
import { AuditLog } from "@/lib/db";
import { api, json } from "@/lib/http";
export const GET = (request: Request) => api(async () => {
  const actor = await requireRole(["AUDITOR"]);
  const params = new URL(request.url).searchParams;
  const action = params.get("action")?.trim().toUpperCase();
  const before = Number(params.get("before"));
  const filter = {
    tenantId: actor.tenantId,
    ...(action ? { action: action.slice(0, 64) } : {}),
    ...(Number.isSafeInteger(before) && before > 0 ? { sequence: { $lt: before } } : {}),
  };
  return json({ entries: await AuditLog.find(filter).sort({ sequence: -1 }).limit(40).lean() });
});
