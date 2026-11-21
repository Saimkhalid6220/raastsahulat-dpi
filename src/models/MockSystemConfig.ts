import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const schema = new Schema({
  tenantId: { type: String, required: true, unique: true },
  nadraOffline: { type: Boolean, default: false },
  nadraLatencyMs: { type: Number, default: 0, min: 0, max: 5000 },
  raastOffline: { type: Boolean, default: false },
  fraudSurge: { type: Boolean, default: false },
}, { timestamps: true });

export type IMockSystemConfig = InferSchemaType<typeof schema>;
export const MockSystemConfig: Model<IMockSystemConfig> = mongoose.models.MockSystemConfig || mongoose.model("MockSystemConfig", schema);
