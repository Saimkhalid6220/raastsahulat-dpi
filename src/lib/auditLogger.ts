import type { Actor } from "../types";
import { sha256 } from "./crypto";
import { AuditLog, connectDB } from "./db";
import { duplicateKey } from "./http";

export async function logAudit(
  actor: Actor, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {},
) {
  await connectDB();
  for (let attempt = 0; attempt < 25; attempt++) {
    const previous = await AuditLog.findOne({ tenantId: actor.tenantId }).sort({ sequence: -1 }).select("sequence hash").lean();
    const entry = {
      tenantId: actor.tenantId, actorId: actor.id, actorRole: actor.role,
      action, entityType, entityId, metadata, sequence: (previous?.sequence ?? 0) + 1,
      previousHash: previous?.hash ?? "GENESIS",
      timestamp: new Date(),
    };
    try {
      await AuditLog.create({ ...entry, hash: sha256(JSON.stringify(entry)) });
      return;
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not append audit entry under concurrent load");
}
