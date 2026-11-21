import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", sparse: true, unique: true },
  cnicNormalized: { type: String, required: true, unique: true, match: /^00000\d{8}$/ },
  fullNameRaw: { type: String, required: true },
  phoneticKey: { type: String, required: true },
  district: { type: String, required: true },
  householdIncomePKR: { type: Number, min: 0 },
  isWidowOrDisabled: { type: Boolean, required: true },
  raastIbanMock: { type: String, required: true },
  assignedHelperId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  helperAccessPinHash: { type: String, required: true, select: false },
  demoLabel: { type: String, required: true },
}, { timestamps: true });

export type ICitizenProfile = InferSchemaType<typeof schema>;
export const CitizenProfile: Model<ICitizenProfile> = mongoose.models.CitizenProfile || mongoose.model("CitizenProfile", schema);
