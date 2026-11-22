import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { roles } from "../types";

const schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  cnicHash: { type: String, unique: true, sparse: true, select: false },
  emailVerified: Date,
  emailVerificationHash: { type: String, unique: true, sparse: true, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  phone: { type: String, required: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true },
  tenantId: { type: String, required: true, default: "DEPT_RELIEF_MAIN", index: true },
  preferredLang: { type: String, enum: ["ur", "en"], default: "ur" },
  apiKeyHash: { type: String, sparse: true, unique: true, select: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export type IUser = InferSchemaType<typeof schema>;
export const User: Model<IUser> = mongoose.models.User || mongoose.model("User", schema);
