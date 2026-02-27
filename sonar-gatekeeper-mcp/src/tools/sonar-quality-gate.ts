import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { QualityGateResponse } from "../sonar/types.ts";

const schema = {
  projectKey: z.string().describe("SonarQube project key"),
  branch: z.string().optional().describe("Branch name"),
  pullRequest: z.string().optional().describe("Pull request ID"),
};

export function registerQualityGateTool(
  server: McpServer,
  client: SonarQubeClient,
) {
  server.tool(
    "sonar.get_quality_gate_status",
    "Get the quality gate status for a SonarQube project. Returns pass/fail status with individual metric conditions.",
    schema,
    async (params) => {
      const queryParams: Record<string, string> = {
        projectKey: params.projectKey,
      };
      if (params.branch) queryParams["branch"] = params.branch;
      if (params.pullRequest) queryParams["pullRequest"] = params.pullRequest;

      const data = await client.get<QualityGateResponse>(
        "/api/qualitygates/project_status",
        queryParams,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}
