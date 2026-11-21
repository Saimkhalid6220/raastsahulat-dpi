import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import mongoose from "mongoose";
import { seed } from "../../scripts/seed";
import { startTestMongo } from "../../scripts/test-mongo";

export interface TestSite {
  url: string;
  logs: () => string;
  stop: () => Promise<void>;
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

export async function startTestSite(distDir: string, production = false): Promise<TestSite> {
  // A new loopback replica set keeps tests isolated from any configured database.
  const mongo = await startTestMongo();
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = mongo.getUri("raastsahulat_test");
  let child: ReturnType<typeof spawn> | undefined;
  let output = "";
  const stop = async () => {
    child?.kill();
    try { await mongoose.disconnect(); } finally {
      await mongo.stop();
      if (previousUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previousUri;
    }
  };

  try {
    await seed();
    const port = await availablePort();
    const url = `http://127.0.0.1:${port}`;
    const command = production ? ["start"] : ["dev", "--webpack"];
    child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), ...command,
      "--hostname", "127.0.0.1", "--port", String(port)], {
      env: { ...process.env, NODE_ENV: production ? "production" : "development",
        AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true",
        NEXT_TELEMETRY_DISABLED: "1", RAAST_NEXT_DIST_DIR: distDir },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-16000); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        if ((await fetch(`${url}/api/openapi`, { signal: AbortSignal.timeout(3500) })).ok) return { url, stop, logs: () => output };
      } catch { /* The server may still be compiling the first route. */ }
      await delay(250);
    }
    throw new Error(`Demo test server did not start.\n${output}`);
  } catch (error) {
    await stop();
    throw error;
  }
}
