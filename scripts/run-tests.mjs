// Unit tests: bundles every src/**/*.test.ts with Vite (same "@/..." aliases
// as the app) into a temp dir and runs them with the Node test runner.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const entries = readdirSync(path.join(root, "src"), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".test.ts"))
  .map((file) => path.join(root, "src", file));
if (entries.length === 0) {
  console.log("No tests found.");
  process.exit(0);
}

const outDir = mkdtempSync(path.join(tmpdir(), "pos-tests-"));
try {
  await build({
    root,
    logLevel: "error",
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: entries, output: { format: "esm", entryFileNames: "[name].mjs" } },
    },
  });
  const files = readdirSync(outDir).filter((file) => file.endsWith(".test.mjs")).map((file) => path.join(outDir, file));
  const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
