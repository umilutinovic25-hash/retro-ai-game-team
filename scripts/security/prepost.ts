// Runs scripts/security/prepostProbe.ts against a baseline commit (throwaway git worktree) and against the
// current checkout, and prints both results. No shell, works on Windows (junction for node_modules).
// Usage: npm run security:prepost [-- <baseline-ref>]   (default: the W08 checkpoint 05456e3)
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ref = process.argv[2] ?? "05456e3";
const repo = resolve(".");
const probe = "scripts/security/prepostProbe.ts";
const worktree = mkdtempSync(join(tmpdir(), "w08-baseline-"));
rmSync(worktree, { recursive: true, force: true });

function runProbe(cwd: string): Record<string, unknown> {
  const out = execFileSync(process.execPath, ["--import", "tsx", probe], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.trim().split(/\r?\n/).filter((line) => line.startsWith("{")).at(-1) ?? "{}") as Record<string, unknown>;
}

try {
  execFileSync("git", ["worktree", "add", "--detach", worktree, ref], { stdio: "ignore" });
  symlinkSync(join(repo, "node_modules"), join(worktree, "node_modules"), "junction");
  mkdirSync(join(worktree, "scripts/security"), { recursive: true });
  cpSync(join(repo, probe), join(worktree, probe));
  const before = runProbe(worktree);
  const after = runProbe(repo);
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  console.log(`scenario | before (${ref}) | after (${head})`);
  for (const key of Object.keys(after)) console.log(`${key} | ${JSON.stringify(before[key] ?? null)} | ${JSON.stringify(after[key])}`);
} finally {
  execFileSync("git", ["worktree", "remove", "--force", worktree], { stdio: "ignore" });
}
