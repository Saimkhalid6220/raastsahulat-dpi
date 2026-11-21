import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  tenantId: { type: String, required: true },
  ruleCode: { type: String, required: true },
  version: { type: Number, required: true, min: 1, validate: Number.isInteger },
  isActive: { type: Boolean, default: true },
  maxAutoApprovePKR: { type: Number, default: 15000 },
  minAutoConfidence: { type: Number, default: 0.92 },
  maxAutoRiskScore: { type: Number, default: 0.15 },
  maxHouseholdIncomePKR: { type: Number, default: 35000 },
  requireWidowOrDisabled: { type: Boolean, default: true },
  allowedDistricts: [String],
  conditions: Schema.Types.Mixed,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  changeNote: { type: String, required: true },
}, { timestamps: true });
schema.index({ tenantId: 1, ruleCode: 1, version: -1 }, { unique: true });
schema.index({ tenantId: 1, isActive: 1, version: -1 });

export type IPolicyRule = InferSchemaType<typeof schema>;
export const PolicyRule: Model<IPolicyRule> = mongoose.models.PolicyRule || mongoose.model("PolicyRule", schema);
