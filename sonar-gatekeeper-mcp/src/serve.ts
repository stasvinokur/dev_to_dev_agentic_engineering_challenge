/**
 * SonarGatekeeper MCP Server — HTTP Streamable HTTP transport.
 *
 * Endpoints:
 *   GET  /health — liveness probe (fast, no external deps)
 *   POST /mcp    — MCP Streamable HTTP (initialize + tool calls)
 *   GET  /mcp    — SSE stream reconnection
 *   DELETE /mcp  — session termination
 *
 * Usage:
 *   bun run src/serve.ts
 *   docker run -p 8000:8000 IMAGE serve
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { loadConfig } from "./config.ts";
import { createSonarClient } from "./sonar/client-factory.ts";
import { createOllamaModel } from "./llm/provider.ts";
import { initLangfuse, shutdownLangfuse } from "./agents/tracing.ts";
import { registerAllTools } from "./tools/index.ts";

const PORT = parseInt(process.env["MCP_PORT"] ?? "8000", 10);

// Load config — resilient: starts even without external services
const config = loadConfig();

// SonarQube client — uses empty token at startup, tools fail with clear error if needed
const sonarClient = createSonarClient(config);
const model = createOllamaModel(config);
const projectRoot = process.env["PROJECT_ROOT"] ?? "/demo_project";

// Initialize Langfuse tracing (non-blocking, tolerates missing config)
initLangfuse(config);

// Session management: one MCP server, multiple transports (one per client session)
const mcpServer = new McpServer({
  name: "sonar-gatekeeper",
  version: "1.0.0",
});

registerAllTools(mcpServer, sonarClient, model, projectRoot);

const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

async function handleMcpRequest(req: Request): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");

  // Existing session
  if (sessionId) {
    const transport = transports.get(sessionId);
    if (!transport) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Session not found" },
          id: null,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    return transport.handleRequest(req);
  }

  // New session (initialization)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
    onsessionclosed: (id) => {
      transports.delete(id);
    },
  });

  await mcpServer.connect(transport);
  return transport.handleRequest(req);
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // Health endpoint — fast, no external deps
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "sonar-gatekeeper",
        version: "1.0.0",
        transport: "streamable-http",
        tools: 7,
      });
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === "/mcp") {
      return handleMcpRequest(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[serve] SonarGatekeeper MCP Server`);
console.log(`[serve] Listening on http://0.0.0.0:${server.port}`);
console.log(`[serve] Endpoints: /health, /mcp`);
console.log(`[serve] Transport: Streamable HTTP (stateful sessions)`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[serve] Shutting down...");
  for (const transport of transports.values()) {
    await transport.close();
  }
  await shutdownLangfuse();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  for (const transport of transports.values()) {
    await transport.close();
  }
  await shutdownLangfuse();
  server.stop();
  process.exit(0);
});
