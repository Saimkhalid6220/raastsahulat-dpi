import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CitizenProfile, ReliefCase } from "../src/lib/db";
import { demoApiKey, demoPassword } from "../src/lib/fixtures";
import { startSyntheticSite, type SyntheticSite } from "../scripts/synthetic-site";
import { addDocumentProvenance } from "../scripts/migrations/001-document-provenance";
import { syntheticEmailDomain } from "../src/lib/fixtures";

let site: SyntheticSite;
let base = "";
let output = "";
const sessions = new Map<string, string>();

beforeAll(async () => {
  site = await startSyntheticSite(".next-integration", false, { RAAST_ALLOW_PERSONAL_SIGNUP: "false", RAAST_LOCAL_MAIL_PORT: "" });
  base = site.url;
}, 170000);

afterAll(async () => { await site?.stop(); });

async function login(role: string) {
  const existing = sessions.get(role);
  if (existing) return existing;
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  output = site.logs();
  expect(csrfResponse.status, output).toBe(200);
  const { csrfToken } = await csrfResponse.json();
  const cookie = csrfResponse.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: `${role}@demo.pk`, password: demoPassword, callbackUrl: base }),
  });
  const session = response.headers.getSetCookie().map((value) => value.split(";")[0])
    .filter((value) => value.startsWith("authjs.session-token"));
  expect(session.length, output).toBeGreaterThan(0);
  const result = session.join("; ");
  sessions.set(role, result);
  return result;
}

async function send(path: string, options: { role?: string; method?: string; data?: unknown; key?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (options.role) headers.set("cookie", await login(options.role));
  if (options.key) headers.set("x-api-key", options.key);
  if (options.origin) headers.set("origin", options.origin);
  if (options.data !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? "GET", headers,
    ...(options.data === undefined ? {} : { body: JSON.stringify(options.data) }),
  });
  output = site.logs();
  return { status: response.status, body: await response.json() };
}

const family = (number: number) => CitizenProfile.findOne({
  cnicNormalized: `00000000000${String(number).padStart(2, "0")}`,
}).lean().orFail();

describe("Phase 2 API and consent", () => {
  it("enforces read-only auditor role on policy publishing and officer actions", async () => {
    const history = await ReliefCase.findOne().orFail();
    expect((await send("/api/rules", { role: "auditor", method: "POST", data: {} })).status).toBe(403);
    expect((await send(`/api/cases/${history.id}`, { role: "auditor", method: "PATCH", data: {} })).status).toBe(403);
  }, 90000);

  it("applies withdrawal to case access and evaluation and appends the denial to the audit trail", async () => {
    const profile = await family(1);
    const created = await send("/api/cases", {
      role: "citizen", method: "POST", origin: base, data: { requestedAmountPKR: 5000, draft: true },
    });
    expect(created.status, output).toBe(201);
    expect((await send("/api/consent", { role: "citizen", method: "DELETE", data: { scope: "NADRA_IDENTITY" } })).status).toBe(200);
    try {
      const denied = await send(`/api/cases/${created.body.record.id}`, { role: "officer" });
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe("CONSENT_REVOKED");
      const claim = await send("/api/cases", { role: "citizen", method: "POST", data: { requestedAmountPKR: 5000 } });
      expect(claim.status).toBe(403);
      expect(claim.body.error).toBe("CONSENT_REVOKED");
      const audit = await send("/api/audit?action=CONSENT_BLOCKED_ACCESS", { role: "auditor" });
      expect(audit.status).toBe(200);
      expect(audit.body.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ entityId: profile._id.toString(), action: "CONSENT_BLOCKED_ACCESS" }),
      ]));
    } finally {
      expect((await send("/api/consent", { role: "citizen", method: "POST", data: { scope: "NADRA_IDENTITY" } })).status).toBe(201);
    }
  }, 90000);

  it("requires a valid API key and returns 201 for a new synthetic REST case", async () => {
    const data = { citizenId: (await family(39))._id.toString(), requestedAmountPKR: 10000, draft: true, idempotencyKey: "public-demo-claim" };
    const path = "/api/v1/public/cases";
    expect((await send(path, { method: "POST", data })).status).toBe(401);
    expect((await send(path, { method: "POST", data, key: "invalid" })).status).toBe(401);
    expect((await send(path, { method: "POST", data, key: demoApiKey, origin: "https://unrelated.example.invalid" })).status).toBe(403);
    const created = await send(path, { method: "POST", data, key: demoApiKey });
    expect(created.status, output).toBe(201);
    const replay = await send(path, { method: "POST", data, key: demoApiKey });
    expect(replay.status).toBe(200);
    expect(replay.body.record.id).toBe(created.body.record.id);
  }, 30000);

  it("unlocks a synthetic family with its credentials and binds the delegation to that family", async () => {
    const first = (await family(2))._id.toString();
    const second = (await family(4))._id.toString();
    const denied = await send("/api/helper/roster", {
      role: "helper", method: "POST", origin: base, data: { citizenId: first, pin: "9999", otp: "246810" },
    });
    expect(denied.status, output).toBe(403);
    const access = await send("/api/helper/roster", {
      role: "helper", method: "POST", origin: base, data: { citizenId: first, pin: "1234", otp: "246810" },
    });
    expect(access.status, output).toBe(200);
    expect(access.body.cnic).toBe("0000000000002");
    const unrelated = await send("/api/cases", { role: "helper", method: "POST", origin: base,
      data: { citizenId: second, requestedAmountPKR: 5000, delegationToken: access.body.token } });
    expect(unrelated.status).toBe(403);
    expect(unrelated.body.error).toBe("DELEGATION_REQUIRED");
  }, 90000);
});

describe("Hackathon requirements", () => {
  it("restricts demo signup to synthetic recipients", async () => {
    const password = "SyntheticCitizen-2026";
    expect((await send("/api/auth/signup", { method: "POST", data: { email: "sample@example.net", password } })).body.error).toBe("SYNTHETIC_EMAIL_REQUIRED");
    const result = await send("/api/auth/signup", { method: "POST", data: { email: `sample@${syntheticEmailDomain}`, password } });
    expect(result.status, output).toBe(201);
    expect(result.body.emailSent).toBe(false);
  }, 90000);

  it("allows a citizen to correct synthetic data and withholds revoked inputs from auditor traces", async () => {
    const updated = await send("/api/profile", { role: "citizen", method: "PATCH", data: {
      fullNameRaw: "Amina Bibi", district: "Karachi", householdIncomePKR: 13337, isWidowOrDisabled: true,
    } });
    expect(updated.status, output).toBe(200);
    expect(updated.body.householdIncomePKR).toBe(13337);
    const created = await submitFixture(1, "auditor-redaction-001");
    expect(created.status, output).toBe(201);
    const path = `/api/audit/cases/${created.body.record.id}`;
    await send("/api/consent", { role: "citizen", method: "DELETE", data: { scope: "BISP_POVERTY_SCORE" } });
    try {
      const trace = await send(path, { role: "auditor" });
      expect(trace.status, output).toBe(200);
      expect(trace.body.auditorTrace.redactedScopes).toContain("BISP_POVERTY_SCORE");
      expect(JSON.stringify(trace.body)).not.toContain("13337");
      expect(trace.body.auditorTrace.inputs).not.toHaveProperty("district");
      expect(trace.body.auditorTrace).not.toHaveProperty("eligibilityFailures");
      expect((await send(`/api/cases/${created.body.record.id}`, { role: "officer" })).status).toBe(403);
    } finally {
      await send("/api/consent", { role: "citizen", method: "POST", data: { scope: "BISP_POVERTY_SCORE" } });
    }
  }, 90000);

  it("checks synthetic image bytes and hands uncertain documents to an officer", async () => {
    const render = async (variant: string) => {
      const sample = await send("/api/documents/sample", { role: "citizen", method: "POST", data: { name: "Amina Bibi", variant } });
      expect(sample.status, output).toBe(200);
      return sample.body.image as string;
    };
    for (const [variant, verdict] of [["CLEAR", "LEGITIMATE"], ["TAMPERED", "SCAM"], ["BLURRY", "UNSURE"]]) {
      const scan = await send("/api/scam-check", { role: "citizen", method: "POST", data: { channel: "DOCUMENT_IMAGE", documentImage: await render(variant) } });
      expect(scan.status, output).toBe(201);
      expect(scan.body.verdict).toBe(verdict);
      expect(scan.body.needsReview).toBe(verdict === "UNSURE");
      if (verdict === "UNSURE") {
        const queue = await send("/api/scam-check/review", { role: "officer" });
        expect(queue.body.reports).toEqual(expect.arrayContaining([expect.objectContaining({ _id: scan.body.id })]));
        expect((await send("/api/scam-check/review", { role: "officer", method: "PATCH", data: { id: scan.body.id, verdict } })).status).toBe(200);
      }
    }
  }, 90000);

  it("assigns a case, reuses its ID when proof is added, and closes the resolved outcome", async () => {
    const create = await send("/api/cases", { role: "citizen", method: "POST", data: { requestedAmountPKR: 6000, draft: true } });
    expect(create.status, output).toBe(201);
    const id = create.body.record.id;
    const path = `/api/cases/${id}`;
    const sample = await send("/api/documents/sample", { role: "citizen", method: "POST", data: { name: "Amina Bibi", variant: "BLURRY" } });
    const first = { documentImage: sample.body.image, idempotencyKey: "same-case-draft", requestedAmountPKR: 6000 };
    expect((await send(path, { role: "citizen", method: "POST", data: first })).body.record).toMatchObject({ id, status: "ESCALATED_HUMAN" });
    const staff = await send("/api/cases/officers", { role: "officer" });
    const officerId = staff.body.currentOfficerId;
    expect((await send(path, { role: "officer", method: "PUT", data: { action: "ASSIGN", officerId } })).body.assignedOfficerId).toBe(officerId);
    const ask = await send(path, { role: "officer", method: "PATCH", data: { decision: "REQUEST_MORE_PROOF", notes: "Please attach a clear synthetic card." } });
    expect(ask.body.status).toBe("NEEDS_MORE_PROOF");
    const clear = await send("/api/documents/sample", { role: "citizen", method: "POST", data: { name: "Amina Bibi", variant: "CLEAR" } });
    const second = { ...first, documentImage: clear.body.image, idempotencyKey: "same-case-proof" };
    expect((await send(path, { role: "citizen", method: "POST", data: second })).body.record).toMatchObject({ id, status: "ESCALATED_HUMAN", decision: { reasons: expect.arrayContaining(["ADDITIONAL_PROOF_REVIEW"]) } });
    expect((await send(path, { role: "citizen", method: "POST", data: second })).body.replayed).toBe(true);
    expect((await send(path, { role: "officer", method: "PATCH", data: { decision: "REJECT", notes: "Closed during the synthetic case test." } })).body.status).toBe("HUMAN_REJECTED");
    expect((await send(path, { role: "officer", method: "PUT", data: { action: "CLOSE" } })).body).toMatchObject({ status: "CLOSED", closedOutcome: "HUMAN_REJECTED" });
  }, 90000);

  it("backfills legacy document provenance idempotently", async () => {
    expect(await addDocumentProvenance()).toBeGreaterThan(0);
    expect(await addDocumentProvenance()).toBe(0);
  }, 30000);
});

const draftRule = {
  maxAutoApprovePKR: 12000, minAutoConfidence: 0.92, maxAutoRiskScore: 0.15,
  maxHouseholdIncomePKR: 35000, requireWidowOrDisabled: true,
  allowedDistricts: ["Karachi", "Badin", "Thatta"], changeNote: "Synthetic test policy",
};

async function submitFixture(number: number, key: string, overrides: Record<string, unknown> = {}) {
  const profile = await family(number);
  return send("/api/v1/public/cases", {
    method: "POST", key: demoApiKey,
    data: { idempotencyKey: key, citizenId: profile._id.toString(), requestedAmountPKR: 7000,
      extractedDocData: { cnic: profile.cnicNormalized, name: profile.fullNameRaw, ocrConfidence: 0.99,
        tamperScore: 0, qrValid: true, documentFixture: "CLEAR", ...overrides } },
  });
}

describe("Phase 3 judgment and simulation", () => {
  let approvedCaseId: string;

  it("evaluates a clean widow claim and disburses exactly once on the mock rail", async () => {
    const result = await submitFixture(5, "clean-widow-001");
    expect(result.status, output).toBe(201);
    expect(result.body.record).toMatchObject({ status: "DISBURSED", ruleVersion: 1, decision: { action: "AUTO_APPROVED" } });
    approvedCaseId = result.body.record.id;
    const payment = await send("/api/mock/raast/disburse", { role: "officer", method: "POST", data: { caseNumber: result.body.record.caseNumber } });
    expect(payment.status, output).toBe(200);
    expect(payment.body).toEqual({ transactionId: result.body.record.transactionId, replayed: true });
  }, 90000);

  it("escalates blurry proof with bilingual explanations and a complete trace", async () => {
    const result = await submitFixture(1, "blurred-document-001", { documentFixture: "BLURRY" });
    expect(result.status, output).toBe(201);
    expect(result.body.record.status).toBe("ESCALATED_HUMAN");
    expect(result.body.record.decision.en).toContain("I am not sure");
    expect(result.body.record.decision.ur).toBeTruthy();
    expect(result.body.record.decision.reasons).toContain("BLURRY_OR_MISSING_DOCUMENT");
    const stored = await ReliefCase.findById(result.body.record.id).orFail().lean();
    expect(stored.aiDecision?.auditorTrace).toMatchObject({ modelId: "raastsahulat-deterministic-v1", ruleVersion: 1 });
    expect(stored.disbursementTxId).toBeUndefined();
  }, 90000);

  it("marks a repeat synthetic CNIC as a review anomaly", async () => {
    const result = await submitFixture(5, "duplicate-cnic-001");
    expect(result.status).toBe(201);
    expect(result.body.record.status).toBe("ESCALATED_HUMAN");
    expect(result.body.record.decision.reasons).toContain("DUPLICATE_CNIC_WITHIN_30_DAYS");
  }, 90000);

  it("applies a newly published policy to the next case and retains the prior snapshot", async () => {
    const published = await send("/api/rules", { role: "admin", method: "POST", data: draftRule });
    expect(published.status, output).toBe(201);
    expect(published.body.rule.version).toBe(2);
    const result = await submitFixture(6, "second-rule-claim");
    expect(result.status).toBe(201);
    expect(result.body.record.ruleVersion).toBe(2);
    const historical = await ReliefCase.findById(approvedCaseId).orFail().lean();
    expect(historical.appliedRuleVersion).toBe(1);
    expect(historical.appliedRuleSnapshot).toMatchObject({ version: 1, maxAutoApprovePKR: 15000 });
  }, 90000);

  it("flags a fake 8171 message and explains what to do", async () => {
    const result = await send("/api/scam-check", { role: "citizen", method: "POST", data: {
      channel: "SMS", senderHeader: "8171-HELP",
      rawContent: "Urgent! Pay a registration fee at http://relief-claim.example.invalid",
    } });
    expect(result.status, output).toBe(201);
    expect(result.body.verdict).toBe("SCAM");
    expect(result.body.redFlags).toEqual(expect.arrayContaining(["IMPERSONATED_SENDER", "UPFRONT_FEE", "UNVERIFIED_LINK"]));
  }, 90000);

  it("replays eligible history against a draft and never changes a case", async () => {
    const before = await ReliefCase.find().sort({ _id: 1 }).lean();
    const evaluated = before.filter((record) => record.aiDecision);
    const auto = evaluated.filter((record) => record.aiDecision?.action === "AUTO_APPROVED");
    const result = await send("/api/rules/simulate", { role: "admin", method: "POST",
      data: { ...draftRule, maxHouseholdIncomePKR: 0 } });
    expect(result.status, output).toBe(200);
    expect(result.body).toMatchObject({
      replayed: evaluated.length, skipped: 0,
      before: { autoApproved: auto.length, payoutPKR: auto.reduce((total, record) => total + record.requestedAmountPKR, 0) },
      after: { autoApproved: 0, escalated: 0, rejected: evaluated.length, payoutPKR: 0 },
    });
    expect(await ReliefCase.find().sort({ _id: 1 }).lean()).toEqual(before);
  }, 90000);

  it("halts for an offline identity service even with a clean document", async () => {
    const config = await send("/api/mock/config", { role: "admin", method: "PATCH", data: { nadraOffline: true } });
    expect(config.status, output).toBe(200);
    try {
      const result = await submitFixture(9, "offline-nadra-001");
      expect(result.status).toBe(201);
      expect(result.body.record.status).toBe("ESCALATED_HUMAN");
      expect(result.body.record.decision.reasons).toContain("NADRA_OFFLINE");
      expect(result.body.record.decision.en).toContain("I am not sure");
      const stored = await ReliefCase.findById(result.body.record.id).orFail().lean();
      expect(stored.aiDecision?.auditorTrace.inputs.nadraOnline).toBe(false);
      expect(stored.disbursementTxId).toBeUndefined();
    } finally {
      await send("/api/mock/config", { role: "admin", method: "PATCH", data: { nadraOffline: false } });
    }
  }, 90000);
});
