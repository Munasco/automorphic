import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { startTradovateRenewal } from "./lib/tradovate-session.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected an application command.");
const envPath = process.env.AUTOMORPHIC_ENV_FILE || join(homedir(), ".automorphic", ".env");
const stopRenewal = startTradovateRenewal(envPath);
const child = spawn(command === "node" ? process.execPath : command, args, {
  stdio: "inherit",
  env: { ...process.env, AUTOMORPHIC_ENV_FILE: envPath },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopRenewal();
    child.kill(signal);
  });
}
child.once("error", () => {
  stopRenewal();
  console.error("Could not start Automorphic.");
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  stopRenewal();
  process.exitCode = code ?? (signal ? 1 : 0);
});
