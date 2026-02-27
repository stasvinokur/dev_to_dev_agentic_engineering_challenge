import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.ts";
import { createSonarClientWithAutoToken } from "./sonar/client-factory.ts";
import { createOllamaModel } from "./llm/provider.ts";
import { initLangfuse, shutdownLangfuse } from "./agents/tracing.ts";
import { registerAllTools } from "./tools/index.ts";

const config = loadConfig();
const sonarClient = await createSonarClientWithAutoToken(config);
const model = createOllamaModel(config);
const projectRoot = process.env["PROJECT_ROOT"] ?? process.cwd();

// Initialize Langfuse tracing (non-blocking)
initLangfuse(config);

const server = new McpServer({
  name: "sonar-gatekeeper",
  version: "1.0.0",
});

registerAllTools(server, sonarClient, model, projectRoot);

const transport = new StdioServerTransport();
await server.connect(transport);

// Graceful shutdown
process.on("SIGINT", async () => {
  await shutdownLangfuse();
  process.exit(0);
});
