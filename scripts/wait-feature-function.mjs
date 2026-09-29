// Probe only the isolated local service; never generate a login code.
import assert from "node:assert/strict";

const port = Number(process.env.NSP_TEST_PORT_BASE || 54321);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65000);
const endpoint = `http://127.0.0.1:${port}/functions/v1/generate-member-login-code`;
const deadline = Date.now() + 60_000;
let lastStatus = "unreachable";
while (Date.now() < deadline) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    lastStatus = String(response.status);
    const body = await response.json();
    if (response.status === 401 && body.error === "Přihlaste se jako admin.") {
      console.log(
        "Local Edge Function is ready and rejects unauthenticated requests.",
      );
      process.exit(0);
    }
  } catch {
    // The gateway can start before its function worker and imports are ready.
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
throw new Error(
  `Local Edge Function did not become ready (HTTP ${lastStatus}).`,
);
