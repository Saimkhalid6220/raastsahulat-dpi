const errorResponses = {
  400: { description: "Invalid synthetic fixture or JSON body" },
  401: { description: "Authentication required" },
  403: { description: "Role denied or consent revoked" },
  409: { description: "Case state or idempotency conflict" },
  503: { description: "Mock service unavailable" },
};
const body = (ref: string) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } } });
const operation = (summary: string, options: { schema?: string; created?: boolean; publicKey?: boolean } = {}) => ({
  summary,
  security: [options.publicKey ? { ApiKey: [] } : { Session: [] }],
  ...(options.schema ? { requestBody: body(options.schema) } : {}),
  responses: { 200: { description: "Success" }, ...(options.created ? { 201: { description: "Created" } } : {}), ...errorResponses },
});
const recordId = { type: "string", pattern: "^[a-fA-F0-9]{24}$" };
const properties = (required: string[], fields: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, required, properties: fields,
});
const text = { type: "string" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const confidence = { type: "number", minimum: 0, maximum: 1 };
const image = { type: "string", contentEncoding: "base64", maxLength: 340000, description: "Synthetic PNG, JPEG, or WebP card. The server derives scan readings from its bytes." };

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "RaastSahulat Demo API", version: "1.0.0",
    description: "Hackathon prototype. Send synthetic fixtures only. Identity, registry and transfer endpoints are simulated.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      Session: { type: "apiKey", in: "cookie", name: "authjs.session-token",
        description: "Sign in with Auth.js. HTTPS uses the __Secure- cookie prefix." },
    },
    schemas: {
      Claim: properties(["requestedAmountPKR"], {
        citizenId: recordId, requestedAmountPKR: { type: "integer", minimum: 1, maximum: 100000 },
        extractedDocData: ref("Document"), documentImage: image, draft: { type: "boolean", default: false },
        idempotencyKey: text, delegationToken: text,
      }),
      Document: { ...properties([], {
        cnic: { type: "string", pattern: "^00000-?[0-9]{7}-?[0-9]$" }, name: text, ocrConfidence: confidence,
        tamperScore: confidence, qrValid: { type: "boolean" },
        documentFixture: { enum: ["CLEAR", "BLURRY", "TAMPERED"] },
      }), description: "Mock fixture inputs for the keyed API and offline helper. Citizens submit an image for automatic evaluation." },
      Consent: properties(["scope"], { scope: { enum: ["NADRA_IDENTITY", "BISP_POVERTY_SCORE", "RAAST_DISBURSEMENT", "HELPER_DELEGATION"] } }),
      CitizenRef: properties(["citizenId"], { citizenId: recordId }),
      Nadra: properties(["citizenId"], {
        citizenId: recordId, cnic: { type: "string", pattern: "^00000-?[0-9]{7}-?[0-9]$" }, name: text,
      }),
      Payment: properties(["caseNumber"], { caseNumber: text }),
      Config: properties([], {
        nadraOffline: { type: "boolean" }, nadraLatencyMs: { type: "integer", minimum: 0, maximum: 5000 },
        raastOffline: { type: "boolean" }, fraudSurge: { type: "boolean" },
      }),
      Delegation: properties(["citizenId", "pin", "otp"], { citizenId: recordId, pin: text, otp: text }),
      Review: properties(["decision", "notes"], {
        decision: { enum: ["APPROVE", "REJECT", "REQUEST_MORE_PROOF"] }, notes: { type: "string", minLength: 5 },
      }),
      ScamCheck: properties(["channel"], {
        channel: { enum: ["SMS", "WHATSAPP", "DOCUMENT_IMAGE"] }, rawContent: text, senderHeader: text,
        documentImage: image,
      }),
      ScamReview: properties(["id", "verdict"], { id: recordId, verdict: { enum: ["SCAM", "LEGITIMATE", "UNSURE"] } }),
      DocumentSample: properties(["name", "variant"], { name: text, variant: { enum: ["CLEAR", "BLURRY", "TAMPERED"] } }),
      Continuation: properties(["documentImage", "idempotencyKey", "requestedAmountPKR"], {
        documentImage: image, idempotencyKey: text, requestedAmountPKR: { type: "integer", minimum: 1, maximum: 100000 },
      }),
      CaseManagement: { oneOf: [properties(["action", "officerId"], { action: { const: "ASSIGN" }, officerId: recordId }), properties(["action"], { action: { const: "CLOSE" } })] },
      ProfileCorrection: properties(["fullNameRaw", "district", "householdIncomePKR", "isWidowOrDisabled"], {
        fullNameRaw: text, district: text, householdIncomePKR: { type: ["integer", "null"], minimum: 0, maximum: 100000 }, isWidowOrDisabled: { type: "boolean" },
      }),
      Policy: properties(
        ["maxAutoApprovePKR", "minAutoConfidence", "maxAutoRiskScore", "maxHouseholdIncomePKR", "requireWidowOrDisabled", "allowedDistricts", "changeNote"],
        {
          maxAutoApprovePKR: { type: "integer", minimum: 1, maximum: 15000 },
          minAutoConfidence: { type: "number", minimum: 0.92, maximum: 1 },
          maxAutoRiskScore: { type: "number", minimum: 0, maximum: 0.15 },
          maxHouseholdIncomePKR: { type: "integer", minimum: 0, maximum: 100000 },
          requireWidowOrDisabled: { type: "boolean" }, allowedDistricts: { type: "array", items: text },
          changeNote: text, conditions: ref("Condition"),
        },
      ),
      Condition: { oneOf: [
        properties(["field", "operator", "value"], { field: { const: "district" }, operator: { const: "equals" }, value: text }),
        properties(["field", "operator", "value"], {
          field: { const: "householdIncomePKR" }, operator: { const: "atMost" }, value: { type: "integer", minimum: 0 },
        }),
        properties(["field", "operator", "value"], {
          field: { const: "isWidowOrDisabled" }, operator: { const: "equals" }, value: { type: "boolean" },
        }),
        properties(["all"], { all: { type: "array", minItems: 1, maxItems: 8, items: ref("Condition") } }),
        properties(["any"], { any: { type: "array", minItems: 1, maxItems: 8, items: ref("Condition") } }),
      ] },
      AccountChange: { oneOf: [
        properties(["action", "userId", "active"], {
          action: { const: "set-active" }, userId: recordId, active: { type: "boolean" },
        }),
        properties(["action"], { action: { const: "rotate-key" } }),
      ] },
    },
  },
  paths: {
    "/api/v1/public/cases": { post: operation("Submit a synthetic relief case with an API key", { schema: "Claim", created: true, publicKey: true }) },
    "/api/cases": { get: operation("List cases visible to the current role"), post: operation("Submit a citizen or delegated case", { schema: "Claim", created: true }) },
    "/api/cases/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: recordId }],
      get: operation("Read a case with active consent"), patch: operation("Record an officer decision", { schema: "Review" }),
      post: operation("Submit a saved draft or add requested synthetic proof to its original case", { schema: "Continuation" }),
      put: operation("Assign or close a case as an officer", { schema: "CaseManagement" }),
    },
    "/api/cases/officers": { get: operation("List the current department's active officers") },
    "/api/profile": { get: operation("Read your synthetic profile"), patch: operation("Correct your synthetic profile", { schema: "ProfileCorrection" }) },
    "/api/documents/sample": { post: operation("Generate a signed synthetic sample image", { schema: "DocumentSample" }) },
    "/api/consent": { get: operation("List your grants"), post: operation("Grant a scope", { schema: "Consent", created: true }), delete: operation("Withdraw a scope", { schema: "Consent" }) },
    "/api/mock/nadra/verify": { post: operation("Compare synthetic identity fields", { schema: "Nadra" }) },
    "/api/mock/bisp/records": { post: operation("Read synthetic eligibility inputs", { schema: "CitizenRef" }) },
    "/api/mock/raast/disburse": { post: operation("Record an idempotent mock transfer", { schema: "Payment" }) },
    "/api/mock/config": { get: operation("View mock fault controls"), patch: operation("Set mock fault controls", { schema: "Config" }) },
    "/api/helper/roster": { get: operation("List assigned family aliases"), post: operation("Unlock one synthetic family", { schema: "Delegation" }) },
    "/api/rules": { get: operation("List policy versions"), post: operation("Publish a policy version", { schema: "Policy", created: true }) },
    "/api/rules/simulate": { post: operation("Replay a draft against historical inputs", { schema: "Policy" }) },
    "/api/scam-check": { get: operation("List your scam reports sent for officer review"), post: operation("Check a synthetic message or document", { schema: "ScamCheck", created: true }) },
    "/api/scam-check/review": { get: operation("Read the officer scam review queue"), patch: operation("Record an officer scam verdict", { schema: "ScamReview" }) },
    "/api/audit": { get: operation("Read the tenant audit chain") },
    "/api/audit/metrics": { get: operation("Read case and labeled scam evaluation metrics") },
    "/api/audit/cases/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: recordId }],
      get: operation("Inspect redacted decision inputs and the exact policy snapshot"),
    },
    "/api/admin/accounts": { get: operation("List synthetic tenant accounts"), patch: operation("Update an account or rotate your API key", { schema: "AccountChange" }) },
  },
};
