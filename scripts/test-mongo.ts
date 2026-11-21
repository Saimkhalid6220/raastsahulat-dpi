import { existsSync } from "node:fs";
import { join } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export function startTestMongo() {
  const cache = join(process.cwd(), "node_modules", ".cache", "mongodb-binaries");
  process.env.MONGOMS_DOWNLOAD_DIR ??= cache;
  const localBinary = join(cache, "bin", "mongod.exe");
  if (process.platform === "win32" && existsSync(localBinary)) process.env.MONGOMS_SYSTEM_BINARY ??= localBinary;
  return MongoMemoryReplSet.create({ replSet: { count: 1, ip: "127.0.0.1" } });
}
