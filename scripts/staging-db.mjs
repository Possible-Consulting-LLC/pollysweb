/** Restricted database entry point for this isolated staging worktree. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { assertStagingEnvironment } from "../src/lib/staging-guard.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const command = process.argv[2];
if (!["status", "deploy"].includes(command)) {
  throw new Error("Use only 'status' or 'deploy' with this staging database command.");
}
const envPath = resolve(root, ".env.local");
if (!existsSync(envPath)) throw new Error("Staging .env.local is missing.");
const loaded = dotenv.config({ path: envPath, override: true, quiet: true });
if (loaded.error) throw new Error("Could not read staging .env.local.");
if (process.env.SPOODLY_ENV !== "staging") {
  throw new Error("SPOODLY_ENV must explicitly be staging.");
}
assertStagingEnvironment(process.env);

console.log("Verified staging project nfdecdylxcmuypxodppe. Running migration", command);
const prisma = resolve(root, "node_modules/.bin/prisma");
const result = spawnSync(prisma, ["migrate", command], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw new Error("Could not start Prisma migration command.");
process.exit(result.status ?? 1);
