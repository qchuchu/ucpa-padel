#!/usr/bin/env node
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = resolve(__dirname, "../src/cli.tsx");
const args = process.argv.slice(2);

try {
  execFileSync("node", ["--import=tsx", cli, ...args], {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
