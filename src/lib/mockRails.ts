import { setTimeout as delay } from "node:timers/promises";
import type { Actor } from "../types";
import { logAudit } from "./auditLogger";
import { assertActiveConsent } from "./consentGuard";
import { CitizenProfile, MockSystemConfig, ReliefCase, connectDB } from "./db";
import { ApiError } from "./http";
import { compareNames } from "./phonetic";

export async function readConfig(tenantId: string) {
  await connectDB();
  return await MockSystemConfig.findOne({ tenantId }).lean() ??
    { nadraOffline: false, nadraLatencyMs: 0, raastOffline: false, fraudSurge: false };
}

export async function verifyNadra(actor: Actor, citizenId: string, cnic?: string, name?: string) {
  await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  const config = await readConfig(actor.tenantId);
  if (config.nadraOffline) return { online: false, reason: "NADRA_OFFLINE" } as const;
  const timeout = 1250;
  if (config.nadraLatencyMs) await delay(Math.min(config.nadraLatencyMs, timeout));
  if (config.nadraLatencyMs >= timeout) return { online: false, reason: "NADRA_TIMEOUT" } as const;
  await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  const profile = await CitizenProfile.findById(citizenId).select("cnicNormalized fullNameRaw").lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  return {
    online: true, cnicMatches: Boolean(cnic && cnic === profile.cnicNormalized),
    ...compareNames(profile.fullNameRaw, name),
  } as const;
}

export async function lookupBisp(actor: Actor, citizenId: string) {
  await assertActiveConsent(citizenId, "BISP_POVERTY_SCORE", actor);
  const profile = await CitizenProfile.findById(citizenId)
    .select("district householdIncomePKR isWidowOrDisabled").lean();
  if (!profile) throw new ApiError(404, "CITIZEN_PROFILE_MISSING");
  return {
    district: profile.district, householdIncomePKR: profile.householdIncomePKR ?? null,
    isWidowOrDisabled: profile.isWidowOrDisabled,
  };
}

export async function disburse(actor: Actor, caseNumber: string) {
  await connectDB();
  const query = { tenantId: actor.tenantId, caseNumber };
  const record = await ReliefCase.findOne(query)
    .select("citizenId status closedOutcome requestedAmountPKR appliedRuleSnapshot disbursementTxId").lean();
  if (!record) throw new ApiError(404, "CASE_NOT_FOUND");
  await assertActiveConsent(record.citizenId.toString(), "RAAST_DISBURSEMENT", actor);
  if ((record.closedOutcome ?? record.status) === "DISBURSED" && record.disbursementTxId) {
    return { transactionId: record.disbursementTxId, replayed: true };
  }
  if (!["AUTO_APPROVED", "HUMAN_APPROVED"].includes(record.status)) {
    throw new ApiError(409, "CASE_NOT_APPROVED");
  }
  const ruleCap = record.appliedRuleSnapshot?.maxAutoApprovePKR;
  if (typeof ruleCap !== "number" || record.requestedAmountPKR > Math.min(ruleCap, 15000)) {
    throw new ApiError(409, "AMOUNT_EXCEEDS_RULE_CAP");
  }
  if ((await readConfig(actor.tenantId)).raastOffline) throw new ApiError(503, "RAAST_OFFLINE");
  await assertActiveConsent(record.citizenId.toString(), "RAAST_DISBURSEMENT", actor);
  const transactionId = `MOCK-${caseNumber}`;
  const updated = await ReliefCase.findOneAndUpdate(
    { ...query, status: record.status },
    { $set: { status: "DISBURSED", disbursementTxId: transactionId }, $unset: { paymentError: 1 } },
    { new: true },
  ).lean();
  if (!updated) {
    const previous = await ReliefCase.findOne(query).select("disbursementTxId").lean();
    if (previous?.disbursementTxId === transactionId) return { transactionId, replayed: true };
    throw new ApiError(409, "CASE_CHANGED");
  }
  await logAudit(actor, "RAAST_DISBURSED", "ReliefCase", updated._id.toString(), {
    transactionId, amount: record.requestedAmountPKR,
  });
  return { transactionId, replayed: false };
}
