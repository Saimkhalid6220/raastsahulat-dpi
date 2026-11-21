import mongoose from "mongoose";

export { User } from "../models/User";
export { CitizenProfile } from "../models/CitizenProfile";
export { ConsentRecord } from "../models/ConsentRecord";
export { ReliefCase } from "../models/ReliefCase";
export { PolicyRule } from "../models/PolicyRule";
export { ScamReport } from "../models/ScamReport";
export { AuditLog } from "../models/AuditLog";
export { MockSystemConfig } from "../models/MockSystemConfig";
export type { IReliefCase } from "../models/ReliefCase";

const cached = globalThis as typeof globalThis & { raastConnection?: Promise<typeof mongoose> };
export async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI to a dedicated synthetic-data database.");
  mongoose.set("bufferCommands", false);
  cached.raastConnection ??= mongoose.connect(uri, {
    maxPoolSize: 10, serverSelectionTimeoutMS: 4000, socketTimeoutMS: 10000,
  });
  try {
    return await cached.raastConnection;
  } finally {
    cached.raastConnection = undefined;
  }
}
