import { randomInt, randomUUID } from "node:crypto";
import { CitizenProfile, connectDB, User } from "./db";
import { hashPassword } from "./crypto";
import { demoTenant } from "./fixtures";
import { ApiError, duplicateKey } from "./http";
import { phoneticKey } from "./phonetic";
import { sendCitizenWelcomeEmail } from "./welcomeMail";

const syntheticName = "Demo Citizen";

export async function registerCitizen(email: string, password: string) {
  const db = await connectDB();
  await Promise.all([User.init(), CitizenProfile.init()]);
  const [passwordHash, helperAccessPinHash] = await Promise.all([
    hashPassword(password), hashPassword(randomUUID()),
  ]);

  for (let attempt = 0; attempt < 3; attempt++) {
    const fixtureNumber = String(randomInt(10_000_000)).padStart(7, "0");
    try {
      await db.connection.transaction(async (session) => {
        const [user] = await User.create([{
          email, passwordHash, name: syntheticName, role: "CITIZEN",
          phone: `DEMO-PHONE-SIGNUP-${fixtureNumber}`, tenantId: demoTenant, preferredLang: "en",
        }], { session });
        await CitizenProfile.create([{
          userId: user._id, cnicNormalized: `000009${fixtureNumber}`,
          fullNameRaw: syntheticName, phoneticKey: phoneticKey(syntheticName),
          district: "Unspecified", isWidowOrDisabled: false, helperAccessPinHash,
          raastIbanMock: `MOCK-RAAST-SIGNUP-${fixtureNumber}`, demoLabel: "Synthetic signup household",
        }], { session });
      });
      return { emailSent: await sendCitizenWelcomeEmail(email) };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      if (await User.exists({ email })) {
        throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered. Sign in to your account.");
      }
    }
  }
  throw new ApiError(503, "SIGNUP_UNAVAILABLE", "Could not create your account. Please try again.");
}
