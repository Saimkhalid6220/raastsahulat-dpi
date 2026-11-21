import { createHmac, timingSafeEqual } from "node:crypto";
import type { Actor } from "../types";
import { logAudit } from "./auditLogger";
import { assertActiveConsent } from "./consentGuard";
import { verifyPassword } from "./crypto";
import { CitizenProfile } from "./db";
import { ApiError } from "./http";

function signature(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  return createHmac("sha256", secret).update("raast-helper:").update(value).digest("base64url");
}

export async function unlockCitizen(actor: Actor, citizenId: string, pin: string, otp: string) {
  await assertActiveConsent(citizenId, "HELPER_DELEGATION", actor);
  const credentials = await CitizenProfile.findOne({ _id: citizenId, assignedHelperId: actor.id })
    .select({ helperAccessPinHash: 1 }).schemaLevelProjections(false).lean();
  if (!credentials?.helperAccessPinHash || otp !== "246810" || !await verifyPassword(pin, credentials.helperAccessPinHash)) {
    throw new ApiError(403, "INVALID_DEMO_PIN_OR_OTP");
  }
  await assertActiveConsent(citizenId, "HELPER_DELEGATION", actor);
  await assertActiveConsent(citizenId, "NADRA_IDENTITY", actor);
  const citizen = await CitizenProfile.findById(citizenId).select("fullNameRaw cnicNormalized").orFail().lean();
  const expires = Date.now() + 60 * 60 * 1000;
  const value = `${actor.id}.${citizenId}.${expires}`;
  await logAudit(actor, "HELPER_DELEGATION_STARTED", "CitizenProfile", citizenId);
  return { token: `${value}.${signature(value)}`, name: citizen.fullNameRaw, cnic: citizen.cnicNormalized, expires };
}

export async function assertDelegated(actor: Actor, citizenId: string, token?: string) {
  const [helper, citizen, expires, signed, ...rest] = token?.split(".") ?? [];
  const expected = signature(`${helper}.${citizen}.${expires}`);
  if (rest.length || helper !== actor.id || citizen !== citizenId || !/^\d{13}$/.test(expires ?? "")
    || Number(expires) <= Date.now() || !signed || !/^[\w-]{43}$/.test(signed)
    || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) {
    throw new ApiError(403, "DELEGATION_REQUIRED");
  }
  await assertActiveConsent(citizenId, "HELPER_DELEGATION", actor);
}
