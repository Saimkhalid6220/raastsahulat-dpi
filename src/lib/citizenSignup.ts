import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { CitizenProfile, connectDB, User } from "./db";
import { hashAccountCnic, hashPassword, sha256 } from "./crypto";
import { demoTenant, syntheticEmailDomain } from "./fixtures";
import { ApiError, duplicateKey } from "./http";
import { logAudit } from "./auditLogger";
import { phoneticKey } from "./phonetic";
import { sendCitizenWelcomeEmail } from "./welcomeMail";

const syntheticName = "Demo Citizen";

export async function registerCitizen(email: string, cnic: string, password: string, origin: string) {
  const syntheticOnly = process.env.RAAST_ALLOW_PERSONAL_SIGNUP === "false";
  if (syntheticOnly && !email.endsWith(`@${syntheticEmailDomain}`)) {
    throw new ApiError(400, "SYNTHETIC_EMAIL_REQUIRED", `Use a synthetic email ending in @${syntheticEmailDomain}.`);
  }
  if (syntheticOnly && !cnic.startsWith("00000")) {
    throw new ApiError(400, "SYNTHETIC_CNIC_REQUIRED", "Use a synthetic CNIC beginning with 00000.");
  }
  const db = await connectDB();
  await Promise.all([User.init(), CitizenProfile.init()]);
  const cnicHash = hashAccountCnic(cnic);
  const alreadyRegistered = () => new ApiError(409, "CNIC_ALREADY_REGISTERED", "An account already exists for this CNIC. Please sign in.");
  if (await User.exists({ cnicHash })) throw alreadyRegistered();
  const token = randomBytes(32).toString("hex");
  const [passwordHash, helperAccessPinHash] = await Promise.all([
    hashPassword(password), hashPassword(randomUUID()),
  ]);

  for (let attempt = 0; attempt < 3; attempt++) {
    const fixtureNumber = String(randomInt(10_000_000)).padStart(7, "0");
    try {
      const userId = await db.connection.transaction(async (session) => {
        const [user] = await User.create([{
          email, cnicHash, passwordHash, name: syntheticName, role: "CITIZEN",
          emailVerificationHash: sha256(token), emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          phone: `DEMO-PHONE-SIGNUP-${fixtureNumber}`, tenantId: demoTenant, preferredLang: "en",
        }], { session });
        await CitizenProfile.create([{
          userId: user._id, cnicNormalized: `000009${fixtureNumber}`,
          fullNameRaw: syntheticName, phoneticKey: phoneticKey(syntheticName),
          district: "Unspecified", isWidowOrDisabled: false, helperAccessPinHash,
          raastIbanMock: `MOCK-RAAST-SIGNUP-${fixtureNumber}`, demoLabel: "Synthetic signup household",
        }], { session });
        return user.id as string;
      });
      await logAudit({ id: userId, role: "CITIZEN", tenantId: demoTenant }, "CITIZEN_REGISTERED", "User", userId);
      return { emailSent: await sendCitizenWelcomeEmail(email, token, origin) };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      if (await User.exists({ cnicHash })) throw alreadyRegistered();
      if (await User.exists({ email })) {
        throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered. Sign in to your account.");
      }
    }
  }
  throw new ApiError(503, "SIGNUP_UNAVAILABLE", "Could not create your account. Please try again.");
}

export async function verifyCitizenEmail(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  await connectDB();
  const verified = await User.findOneAndUpdate({
    role: "CITIZEN", isActive: true, emailVerificationHash: sha256(token), emailVerificationExpiresAt: { $gt: new Date() },
  }, { $set: { emailVerified: new Date() }, $unset: { emailVerificationHash: 1, emailVerificationExpiresAt: 1 } }).select("tenantId").lean();
  if (!verified) return false;
  await logAudit({ id: verified._id.toString(), tenantId: verified.tenantId, role: "CITIZEN" }, "CITIZEN_EMAIL_VERIFIED", "User", verified._id.toString());
  return true;
}
