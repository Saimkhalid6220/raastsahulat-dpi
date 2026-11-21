import { logAudit } from "@/lib/auditLogger";
import { requireRole } from "@/lib/auth";
import { configInput } from "@/lib/contracts";
import { MockSystemConfig } from "@/lib/db";
import { api, json, readJson } from "@/lib/http";
import { readConfig } from "@/lib/mockRails";
export const GET = () => api(async () => json(await readConfig((await requireRole(["ADMIN"])).tenantId)));
export const PATCH = (request: Request) => api(async () => {
  const actor = await requireRole(["ADMIN"]);
  const change = await readJson(request, configInput);
  const config = await MockSystemConfig.findOneAndUpdate(
    { tenantId: actor.tenantId }, { $set: change }, { upsert: true, new: true },
  ).lean();
  await logAudit(actor, "MOCK_CONFIG_CHANGED", "MockSystemConfig", actor.tenantId, change);
  return json(config);
});
