import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { consentScopes } from "../types";

const schema = new Schema({
  citizenId: { type: Schema.Types.ObjectId, ref: "CitizenProfile", required: true },
  granteeType: { type: String, enum: ["DEPARTMENT", "HELPER"], required: true },
  granteeId: { type: String, required: true },
  scopes: [{ type: String, enum: consentScopes, required: true }],
  status: { type: String, enum: ["ACTIVE", "REVOKED"], required: true },
  grantedAt: { type: Date, required: true },
  revokedAt: Date,
  revocationReason: String,
}, { timestamps: true });
schema.index({ citizenId: 1, granteeType: 1, granteeId: 1, scopes: 1 }, {
  unique: true, partialFilterExpression: { status: "ACTIVE" },
});

export type IConsentRecord = InferSchemaType<typeof schema>;
export const ConsentRecord: Model<IConsentRecord> = mongoose.models.ConsentRecord || mongoose.model("ConsentRecord", schema);
