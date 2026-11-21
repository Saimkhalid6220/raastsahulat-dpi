import assert from "node:assert/strict";
import mongoose from "mongoose";
import { CitizenProfile, ConsentRecord } from "../src/lib/db";
import { seed } from "./seed";
import { startTestMongo } from "./test-mongo";

async function verifySeed() {
  const mongo = await startTestMongo();
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
