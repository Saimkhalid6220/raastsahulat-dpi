import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { scamChannels, verdicts } from "../types";

const schema = new Schema({
  fixtureId: { type: String, unique: true, sparse: true },
  tenantId: { type: String, required: true, index: true },
  reporterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  channel: { type: String, enum: scamChannels, required: true },
  rawContent: { type: String, required: true, select: false },
  senderHeader: String,
  verdict: { type: String, enum: verdicts, required: true },
  confidence: { type: Number, required: true },
  redFlags: [String],
  simpleAdviceUr: { type: String, required: true },
  simpleAdviceEn: { type: String, required: true },
  groundTruthLabel: { type: String, enum: ["SCAM", "LEGITIMATE"] },
  reviewStatus: { type: String, enum: ["PENDING", "REVIEWED"] },
  reviewVerdict: { type: String, enum: verdicts },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
}, { timestamps: true });
schema.index({ tenantId: 1, reviewStatus: 1, createdAt: 1 });

export type IScamReport = InferSchemaType<typeof schema>;
export const ScamReport: Model<IScamReport> = mongoose.models.ScamReport || mongoose.model("ScamReport", schema);
