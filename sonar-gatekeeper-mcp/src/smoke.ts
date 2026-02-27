/**
 * Smoke test — starts the server and verifies /health and /mcp endpoints.
 *
 * Usage:
 *   bun run src/smoke.ts
 *   docker run IMAGE smoke
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */
const PORT = 8000;
const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 1000;

console.log("[smoke] Starting SonarGatekeeper smoke test...");
console.log(`[smoke] Launching server on port ${PORT}...`);

// Start server as subprocess
const serverProc = Bun.spawn(["bun", "run", "src/serve.ts"], {
  env: { ...process.env, MCP_PORT: String(PORT) },
  stdout: "pipe",
  stderr: "pipe",
});

let passed = true;

async function checkHealth(): Promise<boolean> {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        console.log(
          `[smoke] /health: OK (status: ${data.status}, version: ${data.version}, tools: ${data.tools})`,
        );
        return true;
      }
      console.log(
        `[smoke] /health: HTTP ${res.status} (attempt ${i}/${MAX_RETRIES})`,
      );
    } catch {
      if (i < MAX_RETRIES) {
        console.log(
          `[smoke] /health: not ready (attempt ${i}/${MAX_RETRIES})`,
        );
      }
    }
    await Bun.sleep(RETRY_DELAY_MS);
  }
  console.error("[smoke] /health: FAILED — server did not become ready");
  return false;
}

async function checkMcpEndpoint(): Promise<boolean> {
  try {
    // Send a minimal POST to /mcp — we expect a proper error (not 404)
    const res = await fetch(`http://localhost:${PORT}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    // Any response that's not 404 means the endpoint exists
    if (res.status !== 404) {
      console.log(`[smoke] /mcp: OK (endpoint available, HTTP ${res.status})`);
      return true;
    }
    console.error("[smoke] /mcp: FAILED — endpoint returned 404");
    return false;
  } catch (e) {
    console.error(
      `[smoke] /mcp: FAILED — ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

try {
  const healthOk = await checkHealth();
  if (!healthOk) passed = false;

  if (healthOk) {
    const mcpOk = await checkMcpEndpoint();
    if (!mcpOk) passed = false;
  }
} finally {
  // Kill server
  serverProc.kill();
  await serverProc.exited;
}

if (passed) {
  console.log("\n[smoke] PASSED");
  process.exit(0);
} else {
  console.log("\n[smoke] FAILED");
  process.exit(1);
}
