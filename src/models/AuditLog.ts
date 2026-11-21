import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { roles } from "../types";

const schema = new Schema({
  tenantId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  actorRole: { type: String, enum: roles, required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  entityType: { type: String, required: true, immutable: true },
  entityId: { type: String, required: true, immutable: true },
  metadata: { type: Schema.Types.Mixed, required: true, immutable: true },
  sequence: { type: Number, required: true, immutable: true },
  previousHash: { type: String, required: true, immutable: true },
  hash: { type: String, required: true, immutable: true },
  timestamp: { type: Date, required: true, immutable: true },
}, { versionKey: false });
schema.index({ tenantId: 1, sequence: -1 }, { unique: true });
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"], function () {
  throw new Error("Audit records are append-only");
});
schema.pre("save", function () {
  if (!this.isNew) throw new Error("Audit records are append-only");
});
schema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error("Audit records are append-only");
});

export type IAuditLog = InferSchemaType<typeof schema>;
export const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model("AuditLog", schema);
