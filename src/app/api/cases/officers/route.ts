import { requireRole } from "@/lib/auth";
import { User } from "@/lib/db";
import { api, json } from "@/lib/http";

export const GET = () => api(async () => {
  const actor = await requireRole(["OFFICER"]);
  const officers = await User.find({ tenantId: actor.tenantId, role: "OFFICER", isActive: true }).select("name").sort({ name: 1 }).lean();
  return json({ currentOfficerId: actor.id, officers: officers.map((officer) => ({ id: officer._id.toString(), name: officer.name })) });
});
