import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { caseStatuses, channels, reviewDecisions } from "../types";

const documentData = new Schema({
  cnic: String, name: String, ocrConfidence: Number, tamperScore: Number,
  qrValid: Boolean, documentFixture: String, scanIssue: String, source: String,
}, { _id: false });
const decision = new Schema({
  action: { type: String, required: true },
  confidence: { type: Number, required: true },
  riskScore: { type: Number, required: true },
  uncertaintyReasons: [String],
  citizenExplanationEn: { type: String, required: true },
  citizenExplanationUr: { type: String, required: true },
  ttsScript: { en: String, ur: String },
  auditorTrace: { type: Schema.Types.Mixed, required: true },
}, { _id: false });
const review = new Schema({
  officerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  decision: { type: String, enum: reviewDecisions, required: true },
  notes: { type: String, required: true },
  reviewedAt: { type: Date, required: true },
}, { _id: false });

const schema = new Schema({
  caseNumber: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, unique: true, sparse: true },
  submissionHash: String,
  tenantId: { type: String, required: true },
  citizenId: { type: Schema.Types.ObjectId, ref: "CitizenProfile", required: true },
  submittedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  submissionChannel: { type: String, enum: channels, required: true },
  requestedAmountPKR: { type: Number, required: true, min: 1 },
  extractedDocData: documentData,
  status: { type: String, enum: caseStatuses, required: true },
  aiDecision: decision,
  appliedRuleVersion: Number,
  appliedRuleSnapshot: Schema.Types.Mixed,
  officerReview: review,
  assignedOfficerId: { type: Schema.Types.ObjectId, ref: "User" },
  closedBy: { type: Schema.Types.ObjectId, ref: "User" },
  closedAt: Date,
  closedOutcome: { type: String, enum: ["HUMAN_REJECTED", "DISBURSED"] },
  continuations: [new Schema({ key: String, hash: String }, { _id: false })],
  additionalProof: Boolean,
  disbursementTxId: { type: String, unique: true, sparse: true },
  paymentError: String,
}, { timestamps: true });
schema.index({ tenantId: 1, citizenId: 1, createdAt: -1 });
schema.index({ tenantId: 1, status: 1, "aiDecision.confidence": 1 });
schema.index({ tenantId: 1, status: 1, updatedAt: -1 });

export type IReliefCase = InferSchemaType<typeof schema>;
export const ReliefCase: Model<IReliefCase> = mongoose.models.ReliefCase || mongoose.model("ReliefCase", schema);
