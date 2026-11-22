import { loadEnvConfig } from "@next/env";
import { connectDB } from "../src/lib/db";
import { addDocumentProvenance } from "./migrations/001-document-provenance";

async function migrate() {
  loadEnvConfig(process.cwd(), true);
  const db = await connectDB();
  try {
    const updated = await addDocumentProvenance();
    console.info(`001-document-provenance: updated ${updated} legacy cases`);
  } finally {
    await db.disconnect();
  }
}

void migrate().catch((error: unknown) => {
  console.error("MongoDB migration failed", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
});
