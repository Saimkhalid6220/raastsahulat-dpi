import { ReliefCase } from "../../src/lib/db";

export async function addDocumentProvenance() {
  await ReliefCase.createIndexes();
  const result = await ReliefCase.updateMany({
    extractedDocData: { $exists: true }, "extractedDocData.source": { $exists: false },
  }, { $set: { "extractedDocData.source": "LEGACY_FIXTURE" } }, { timestamps: false });
  return result.modifiedCount;
}
