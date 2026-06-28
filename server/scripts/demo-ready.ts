import { spawn } from "node:child_process";

const checks = ["demo:live", "demo:ble-agent", "env:check"];

async function main(): Promise<void> {
  for (const check of checks) {
    console.log(`\n== npm run ${check} ==`);
    await runNpm(check);
  }

  console.log("\nPocketBridge demo readiness passed");
  console.log("- Browser/HTTP demo path is green.");
  console.log("- Mac BLE Agent handoff path is green.");
  console.log("- Environment status has been reported.");
}

async function runNpm(script: string): Promise<void> {
  const process = spawn("npm", ["run", script], {
    stdio: "inherit",
    env: processEnv()
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    process.once("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`npm run ${script} failed with exit code ${exitCode}`);
  }
}

function processEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
