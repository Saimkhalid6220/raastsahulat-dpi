import { loadEnvConfig } from "@next/env";
import { Types } from "mongoose";
import {
  AuditLog, CitizenProfile, ConsentRecord, MockSystemConfig, PolicyRule, ReliefCase,
  ScamReport, User, connectDB,
} from "../src/lib/db";
import { hashPassword, sha256 } from "../src/lib/crypto";
import { demoApiKey, demoNames, demoPassword, demoPin, demoScams, demoTenant } from "../src/lib/fixtures";
import { roles } from "../src/types";

const fixturePhonetics: Record<string, string> = {
  MUHAMMAD: "MHMD", MOHAMMAD: "MHMD", BIBI: "BB", BEEVI: "BB", FATIMA: "FTM",
  ABDUR: "ABDL", SALEEM: "SLM", SALIM: "SLM",
};

export async function seed() {
  await connectDB();
  await Promise.all([
    User.init(), CitizenProfile.init(), ConsentRecord.init(), PolicyRule.init(),
    ReliefCase.init(), ScamReport.init(), AuditLog.init(), MockSystemConfig.init(),
  ]);
  const [passwordHash, helperAccessPinHash] = await Promise.all([
    hashPassword(demoPassword), hashPassword(demoPin),
  ]);
  const accounts = await Promise.all(roles.map(async (role, index) => {
    const email = `${role.toLowerCase()}@demo.pk`;
    const account = await User.findOneAndUpdate({ email }, {
      $setOnInsert: {
        name: `Demo ${role.toLowerCase()}`, email, phone: `DEMO-PHONE-${index + 1}`,
        passwordHash, role, tenantId: demoTenant, preferredLang: role === "CITIZEN" ? "ur" : "en",
        ...(role === "ADMIN" ? { apiKeyHash: sha256(demoApiKey) } : {}),
      },
    }, { upsert: true, new: true, timestamps: false });
    if (!account) throw new Error(`Could not seed ${role} demo account`);
    return [role, account._id] as const;
  }));
  const userIds = Object.fromEntries(accounts) as Record<(typeof roles)[number], Types.ObjectId>;
  const families = await Promise.all(Array.from({ length: 40 }, async (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const cnicNormalized = `00000000000${number}`;
    const fullNameRaw = demoNames[index % demoNames.length];
    const family = await CitizenProfile.findOneAndUpdate({ cnicNormalized }, {
      $setOnInsert: {
        cnicNormalized, fullNameRaw, demoLabel: `Synthetic household ${number}`,
        phoneticKey: fullNameRaw.toUpperCase().split(" ").map((token) => fixturePhonetics[token] ?? token).join("_"),
        district: ["Karachi", "Badin", "Thatta"][index % 3],
        ...(index !== 7 ? { householdIncomePKR: 12000 + index * 900 } : {}),
        isWidowOrDisabled: index % 4 !== 2,
        raastIbanMock: `MOCK-RAAST-${number}`, assignedHelperId: userIds.HELPER,
        helperAccessPinHash,
        ...(index === 0 ? { userId: userIds.CITIZEN } : {}),
      },
    }, { upsert: true, new: true, timestamps: false });
    if (!family) throw new Error(`Could not seed synthetic household ${number}`);
    const grantedAt = new Date("2026-01-01T00:00:00Z");
    const grants = [
      { granteeType: "DEPARTMENT", granteeId: demoTenant, scopes: ["NADRA_IDENTITY", "BISP_POVERTY_SCORE", "RAAST_DISBURSEMENT"] },
      { granteeType: "HELPER", granteeId: userIds.HELPER.toString(), scopes: ["HELPER_DELEGATION"] },
    ];
    await Promise.all(grants.flatMap(({ granteeType, granteeId, scopes }) => scopes.map((scope) => {
      const seedId = new Types.ObjectId(sha256(`${cnicNormalized}:${granteeType}:${granteeId}:${scope}`).slice(0, 24));
      return ConsentRecord.updateOne({ _id: seedId }, {
        $setOnInsert: { citizenId: family._id, granteeType, granteeId, grantedAt, scopes: [scope], status: "ACTIVE" },
      }, { upsert: true, timestamps: false });
    })));
    return family;
  }));

  const selector = { tenantId: demoTenant, ruleCode: "FLOOD_RELIEF_2026", version: 1 };
  const rule = await PolicyRule.findOneAndUpdate(selector, {
    $setOnInsert: {
      ...selector, allowedDistricts: ["Karachi", "Badin", "Thatta"],
      createdBy: userIds.ADMIN, changeNote: "Initial synthetic flood relief policy",
    },
  }, { upsert: true, new: true });
  if (!rule) throw new Error("Could not seed the initial policy");
  await MockSystemConfig.updateOne({ tenantId: demoTenant }, {
    $setOnInsert: { tenantId: demoTenant },
  }, { upsert: true, timestamps: false });

  await Promise.all(families.slice(10, 25).map(async (family, index) => {
    const status = (["DISBURSED", "ESCALATED_HUMAN", "HUMAN_REJECTED"] as const)[index % 3];
    const caseNumber = `RS-2026-DEMO-${String(index + 1).padStart(2, "0")}`;
    const confidence = status === "ESCALATED_HUMAN" ? 0.6 : 0.99;
    const action = status === "DISBURSED" ? "AUTO_APPROVED" : status;
    const createdAt = new Date(Date.UTC(2026, 0, index + 1));
    await ReliefCase.updateOne({ caseNumber }, {
      $setOnInsert: {
        tenantId: demoTenant, citizenId: family._id, submittedByUserId: userIds.HELPER,
        submissionChannel: "HELPER_OFFLINE_SYNC", requestedAmountPKR: 8000 + index * 400,
        status, appliedRuleVersion: 1, appliedRuleSnapshot: rule.toObject(), createdAt, updatedAt: createdAt,
        ...(status === "DISBURSED" ? { disbursementTxId: `MOCK-${caseNumber}` } : {}),
        extractedDocData: { cnic: family.cnicNormalized, name: family.fullNameRaw, ocrConfidence: confidence, tamperScore: 0, qrValid: true },
        aiDecision: {
          action, confidence, riskScore: 0,
          uncertaintyReasons: status === "ESCALATED_HUMAN" ? ["LOW_OCR_CONFIDENCE"] : [],
          citizenExplanationEn: status === "ESCALATED_HUMAN"
            ? "I am not sure the document is clear. An officer will review your case."
            : "This synthetic case has been reviewed. See the status for the outcome.",
          citizenExplanationUr: status === "ESCALATED_HUMAN"
            ? "دستاویز واضح نہیں ہے۔ ایک افسر آپ کی درخواست دیکھے گا۔"
            : "اس فرضی درخواست کا جائزہ لیا گیا ہے۔ نتیجے کے لیے موجودہ حیثیت دیکھیں۔",
          auditorTrace: {
            modelId: "synthetic-history", ruleVersion: 1, latencyMs: 0, tokenCost: 0,
            inputs: { ocrConfidence: confidence, nameScore: 1, tamperScore: 0, nadraOnline: true,
              repeatedClaim: false, district: family.district, householdIncomePKR: family.householdIncomePKR,
              isWidowOrDisabled: family.isWidowOrDisabled },
          },
        },
      },
    }, { upsert: true, timestamps: false });
  }));

  await Promise.all(demoScams.map(async ([senderHeader, rawContent, groundTruthLabel], index) => {
    const fixtureId = `DEMO-SMS-${index + 1}`;
    const scam = groundTruthLabel === "SCAM";
    await ScamReport.updateOne({ fixtureId }, {
      $setOnInsert: {
        tenantId: demoTenant, reporterUserId: userIds.CITIZEN, channel: "SMS", rawContent, senderHeader,
        verdict: groundTruthLabel, confidence: 0.98, groundTruthLabel,
        redFlags: scam ? ["SENSITIVE_INFORMATION_OR_FEE_REQUEST"] : [],
        simpleAdviceEn: scam ? "Do not pay or share any PIN." : "Check the message in your demo portal.",
        simpleAdviceUr: scam ? "رقم ادا نہ کریں اور پن ظاہر نہ کریں۔" : "اپنے ڈیمو پورٹل میں پیغام دیکھیں۔",
      },
    }, { upsert: true, timestamps: false });
  }));

  return {
    accounts: Object.keys(userIds).length,
    families: await CitizenProfile.countDocuments({ assignedHelperId: userIds.HELPER }),
    activeSeedGrants: await ConsentRecord.countDocuments({
      citizenId: { $in: families.map(({ _id }) => _id) }, status: "ACTIVE",
      grantedAt: new Date("2026-01-01T00:00:00Z"),
    }),
    historicalCases: await ReliefCase.countDocuments({ tenantId: demoTenant, caseNumber: /^RS-2026-DEMO-/ }),
    scamSamples: await ScamReport.countDocuments({ tenantId: demoTenant, fixtureId: /^DEMO-SMS-/ }),
  };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/seed.ts")) {
  loadEnvConfig(process.cwd());
  let database: Awaited<ReturnType<typeof connectDB>> | undefined;
  void (async () => {
    try {
      database = await connectDB();
      console.log("Synthetic seed counts", await seed());
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Synthetic seed failed");
      process.exitCode = 1;
    } finally {
      await database?.disconnect();
    }
  })();
}
