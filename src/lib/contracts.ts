import { z } from "zod";
import { consentScopes, reviewDecisions, scamChannels } from "../types";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Expected a record ID");
export const mockCnic = z.string().max(15).transform((input) => input.replaceAll("-", ""))
  .pipe(z.string().regex(/^00000\d{8}$/, "Use a synthetic CNIC beginning with 00000"));
export const docData = z.object({
  cnic: mockCnic.optional(),
  name: z.string().trim().max(100).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  tamperScore: z.number().min(0).max(1).optional(),
  qrValid: z.boolean().optional(),
  documentFixture: z.enum(["CLEAR", "BLURRY", "TAMPERED"]).optional(),
}).strict();
export const claimInput = z.object({
  citizenId: objectId.optional(),
  requestedAmountPKR: z.number().int().min(1).max(100000),
  extractedDocData: docData.optional(),
  draft: z.boolean().default(false),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/).optional(),
  delegationToken: z.string().max(512).optional(),
}).strict();
export const consentChange = z.object({ scope: z.enum(consentScopes) }).strict();
export const nadraInput = z.object({ citizenId: objectId, cnic: mockCnic.optional(), name: z.string().max(100).optional() }).strict();
export const paymentInput = z.object({ caseNumber: z.string().max(60) }).strict();
export const configInput = z.object({
  nadraOffline: z.boolean().optional(), nadraLatencyMs: z.number().int().min(0).max(5000).optional(),
  raastOffline: z.boolean().optional(), fraudSurge: z.boolean().optional(),
}).strict();
export const ruleInput = z.object({
  maxAutoApprovePKR: z.number().int().min(1).max(15000),
  minAutoConfidence: z.number().min(0.92).max(1),
  maxAutoRiskScore: z.number().min(0).max(0.15),
  maxHouseholdIncomePKR: z.number().int().min(0).max(100000),
  requireWidowOrDisabled: z.boolean(),
  allowedDistricts: z.array(z.string().trim().min(1).max(40)).max(20),
  changeNote: z.string().trim().min(1).max(250),
}).strict();
export const officerInput = z.object({
  decision: z.enum(reviewDecisions), notes: z.string().trim().min(5).max(300),
}).strict();
export const scamInput = z.object({
  channel: z.enum(scamChannels),
  rawContent: z.string().trim().min(1).max(1000),
  senderHeader: z.string().trim().max(40).optional(),
  documentFixture: z.enum(["CLEAR", "BLURRY", "TAMPERED"]).optional(),
}).strict();
export type ClaimInput = z.output<typeof claimInput>;
export type RuleInput = z.output<typeof ruleInput>;
