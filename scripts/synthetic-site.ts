import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import mongoose from "mongoose";
import { seed } from "./seed";
import { startTestMongo } from "./test-mongo";

export interface SyntheticSite {
  url: string;
  logs: () => string;
  exited: Promise<number | null>;
  stop: () => Promise<void>;
}

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a loopback port");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

export async function startSyntheticSite(distDir: string, production = false): Promise<SyntheticSite> {
  // Each launch seeds an isolated loopback replica set.
  const mongo = await startTestMongo();
  const previousUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = mongo.getUri("raastsahulat_demo");
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
    const server = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), ...command,
      "--hostname", "127.0.0.1", "--port", String(port)], {
      env: { ...process.env, NODE_ENV: production ? "production" : "development",
        AUTH_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: url, NEXTAUTH_URL: url,
        NEXT_TELEMETRY_DISABLED: "1", RAAST_NEXT_DIST_DIR: distDir },
      stdio: ["ignore", "pipe", "pipe"], detached: process.platform === "win32", windowsHide: true,
    });
    child = server;
    const capture = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-16000); };
    server.stdout?.on("data", capture);
    server.stderr?.on("data", capture);
    let launchError: Error | undefined;
    const exited = new Promise<number | null>((resolve) => {
      server.once("exit", resolve);
      server.once("error", (error) => {
        launchError = error;
        resolve(1);
      });
    });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline && server.exitCode === null && server.signalCode === null && !launchError) {
      try {
        if ((await fetch(`${url}/api/openapi`, { signal: AbortSignal.timeout(3500) })).ok) return { url, stop, exited, logs: () => output };
      } catch { /* The server may still be compiling the first route. */ }
      await delay(250);
    }
    throw new Error(`RaastSahulat did not start.\n${output}`, { cause: launchError });
  } catch (error) {
    await stop();
    throw error;
  }
}
