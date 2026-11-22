import { z } from "zod";
import { consentScopes, reviewDecisions, scamChannels } from "../types";
import { demoDistricts, syntheticNames } from "./fixtures";

export const emailAddress = z.string().trim().toLowerCase().email().max(254);
export const accountCnic = z.string().trim().regex(/^(?:\d{13}|\d{5}-\d{7}-\d)$/, "Enter a 13-digit CNIC with or without dashes.")
  .transform((value) => value.replaceAll("-", ""));
export const citizenSignupInput = z.object({
  email: emailAddress,
  cnic: accountCnic,
  password: z.string().min(8).max(100),
}).strict();

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
export const imagePayloadLimit = 360 * 1024;
export const documentImage = z.string().max(340000).regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const sampleInput = z.object({ name: z.enum(syntheticNames), variant: z.enum(["CLEAR", "BLURRY", "TAMPERED"]) }).strict();
const requestKey = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
export const claimInput = z.object({
  citizenId: objectId.optional(),
  requestedAmountPKR: z.number().int().min(1).max(100000),
  extractedDocData: docData.optional(),
  documentImage: documentImage.optional(),
  draft: z.boolean().default(false),
  idempotencyKey: requestKey.optional(),
  delegationToken: z.string().max(512).optional(),
}).strict().refine((input) => !(input.documentImage && input.extractedDocData), "Send one document source");
export const profileCorrection = z.object({
  fullNameRaw: z.enum(syntheticNames), district: z.enum(demoDistricts),
  householdIncomePKR: z.number().int().min(0).max(100000).nullable(), isWidowOrDisabled: z.boolean(),
}).strict();
export const caseContinuation = z.object({
  documentImage, idempotencyKey: requestKey, requestedAmountPKR: z.number().int().min(1).max(100000),
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
export const caseManagement = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ASSIGN"), officerId: objectId }).strict(),
  z.object({ action: z.literal("CLOSE") }).strict(),
]);
export const scamInput = z.object({
  channel: z.enum(scamChannels),
  rawContent: z.string().trim().max(1000).default(""),
  senderHeader: z.string().trim().max(40).optional(),
  documentImage: documentImage.optional(),
}).strict().refine((input) => input.channel === "DOCUMENT_IMAGE" ? Boolean(input.documentImage) : Boolean(input.rawContent && !input.documentImage), "Supply a synthetic image or message for the selected channel");
export type ClaimInput = z.output<typeof claimInput>;
export type CaseContinuation = z.output<typeof caseContinuation>;
export type CaseManagement = z.output<typeof caseManagement>;
export type RuleInput = z.output<typeof ruleInput>;
