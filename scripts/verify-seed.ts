import assert from "node:assert/strict";
import { join } from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { CitizenProfile, ConsentRecord } from "../src/lib/db";
import { seed } from "./seed";

async function verifySeed() {
  process.env.MONGOMS_DOWNLOAD_DIR ??= join(process.cwd(), "node_modules", ".cache", "mongodb-binaries");
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: "127.0.0.1" } });
  process.env.MONGODB_URI = mongo.getUri("raastsahulat_phase1");
  try {
    const expected = { accounts: 5, families: 40, activeSeedGrants: 160, historicalCases: 15, scamSamples: 12 };
    assert.deepEqual(await seed(), expected);
    console.log("First seed passed", expected);
    assert.deepEqual(await seed(), expected);
    console.log("Second seed passed", expected);

    const profile = await CitizenProfile.findOne({ cnicNormalized: "0000000000001" })
      .select("+helperAccessPinHash").orFail().lean();
    const { _id, userId, ...duplicateFixture } = profile;
    assert.ok(userId);
    await assert.rejects(CitizenProfile.create(duplicateFixture), { code: 11000 });
    const revoked = await ConsentRecord.findOneAndUpdate(
      { citizenId: _id, scopes: "NADRA_IDENTITY" },
      { status: "REVOKED", revokedAt: new Date() },
      { new: true },
    ).orFail();
    assert.deepEqual(await seed(), { ...expected, activeSeedGrants: 159 });
    assert.equal((await ConsentRecord.findById(revoked._id).orFail()).status, "REVOKED");
    console.log("Duplicate CNIC and consent revocation checks passed");
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}

void verifySeed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
