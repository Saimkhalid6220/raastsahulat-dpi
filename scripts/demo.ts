import { access } from "node:fs/promises";
import { startSyntheticSite } from "./synthetic-site";

async function main() {
  try {
    await access(".next/BUILD_ID");
  } catch {
    throw new Error("Run npm run build before starting the demo.");
  }

  const site = await startSyntheticSite(".next", true);
  console.log(`RaastSahulat demo is ready at ${site.url}`);
  console.log("Press Ctrl+C to close the demo.");

  const { promise: shutdownRequested, resolve } = Promise.withResolvers<void>();
  const requestShutdown = () => resolve();
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  try {
    const result = await Promise.race([shutdownRequested, site.exited]);
    if (result !== undefined) throw new Error(`The demo server exited.\n${site.logs()}`);
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    await site.stop();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The demo could not start.");
  process.exitCode = 1;
});
