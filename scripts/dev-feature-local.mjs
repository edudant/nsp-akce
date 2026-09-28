// Local browser verification server using synthetic fixtures only.
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const f = JSON.parse(
  await fs.readFile("/tmp/nsp-supabase-tests/browser-fixture.json", "utf8"),
);
assert.equal(f.url, "http://127.0.0.1:54321");
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5175",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: f.url,
      VITE_SUPABASE_ANON_KEY: f.anon,
      VITE_SUPABASE_PUBLISHABLE_KEY: f.anon,
    },
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
