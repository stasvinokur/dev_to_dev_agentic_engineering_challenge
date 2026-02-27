import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LanguageModel } from "ai";
import type { SonarQubeClient } from "../sonar/client.ts";
import { registerQualityGateTool } from "./sonar-quality-gate.ts";
import { registerSearchIssuesTool } from "./sonar-search-issues.ts";
import { registerRuleTool } from "./sonar-rules.ts";
import { registerLocateTool } from "./repo-locate.ts";
import { registerProposePatchTool } from "./repo-propose-patch.ts";
import { registerRunChecksTool } from "./repo-run-checks.ts";
import { registerPipelineTool } from "./pipeline.ts";

export function registerAllTools(
  server: McpServer,
  client: SonarQubeClient,
  model: LanguageModel,
  projectRoot: string,
) {
  // SonarQube tools
  registerQualityGateTool(server, client);
  registerSearchIssuesTool(server, client);
  registerRuleTool(server, client);

  // Repository tools
  registerLocateTool(server, projectRoot);
  registerProposePatchTool(server, projectRoot);
  registerRunChecksTool(server, projectRoot);

  // Pipeline tool (Layer 2)
  registerPipelineTool(server, client, model, projectRoot);
}
