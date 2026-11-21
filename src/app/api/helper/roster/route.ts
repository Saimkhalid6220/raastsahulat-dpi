import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { objectId } from "@/lib/contracts";
import { CitizenProfile, ConsentRecord } from "@/lib/db";
import { unlockCitizen } from "@/lib/delegation";
import { api, json, readJson } from "@/lib/http";
export const GET = () => api(async () => {
  const actor = await requireRole(["HELPER"]);
  const [profiles, consent] = await Promise.all([
    CitizenProfile.find({ assignedHelperId: actor.id }).select("demoLabel").sort({ demoLabel: 1 }).limit(100).lean(),
    ConsentRecord.find({ granteeId: actor.id, scopes: "HELPER_DELEGATION", status: "ACTIVE" }).select("citizenId").lean(),
  ]);
  const granted = new Set(consent.map((record) => record.citizenId.toString()));
  return json({ families: profiles.map(({ _id, demoLabel }) => ({ id: _id.toString(), label: demoLabel, active: granted.has(_id.toString()) })) });
});
export const POST = (request: Request) => api(async () => {
  const actor = await requireRole(["HELPER"]);
  const { citizenId, pin, otp } = await readJson(request, z.object({ citizenId: objectId, pin: z.string().regex(/^\d{4}$/), otp: z.string().regex(/^\d{6}$/) }).strict());
  return json(await unlockCitizen(actor, citizenId, pin, otp));
});
