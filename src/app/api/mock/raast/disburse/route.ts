import { requireRole } from "@/lib/auth";
import { paymentInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";
import { disburse } from "@/lib/mockRails";
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["OFFICER", "ADMIN"]);
  const { caseNumber } = await readJson(request, paymentInput);
  return json(await disburse(actor, caseNumber));
});
