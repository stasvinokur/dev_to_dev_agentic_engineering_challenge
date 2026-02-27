import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { IssuesSearchResponse } from "../sonar/types.ts";

const schema = {
  projectKey: z.string().describe("SonarQube project key"),
  branch: z.string().optional().describe("Branch name"),
  pullRequest: z.string().optional().describe("Pull request ID"),
  resolved: z
    .boolean()
    .default(false)
    .describe("Include resolved issues (default: false, shows only open)"),
  impactSeverities: z
    .string()
    .optional()
    .describe("Comma-separated impact severities: BLOCKER,HIGH,MEDIUM,LOW,INFO"),
  impactSoftwareQualities: z
    .string()
    .optional()
    .describe(
      "Comma-separated software qualities: MAINTAINABILITY,RELIABILITY,SECURITY",
    ),
  types: z
    .string()
    .optional()
    .describe(
      "[Deprecated] Comma-separated issue types: CODE_SMELL,BUG,VULNERABILITY",
    ),
  severities: z
    .string()
    .optional()
    .describe(
      "[Deprecated] Comma-separated severities: BLOCKER,CRITICAL,MAJOR,MINOR,INFO",
    ),
  pageSize: z
    .number()
    .min(1)
    .max(500)
    .default(100)
    .describe("Number of issues per page (1-500, default: 100)"),
  page: z.number().min(1).default(1).describe("Page number (default: 1)"),
};

export function registerSearchIssuesTool(
  server: McpServer,
  client: SonarQubeClient,
) {
  server.tool(
    "sonar.search_issues",
    "Search for issues in a SonarQube project. Returns issues with filtering and pagination. Echoes the actual API query parameters used for debugging.",
    schema,
    async (params) => {
      const queryParams: Record<string, string> = {
        componentKeys: params.projectKey,
        ps: String(params.pageSize),
        p: String(params.page),
        resolved: String(params.resolved),
      };

      if (params.branch) queryParams["branch"] = params.branch;
      if (params.pullRequest) queryParams["pullRequest"] = params.pullRequest;
      if (params.impactSeverities)
        queryParams["impactSeverities"] = params.impactSeverities;
      if (params.impactSoftwareQualities)
        queryParams["impactSoftwareQualities"] =
          params.impactSoftwareQualities;
      if (params.types) queryParams["types"] = params.types;
      if (params.severities) queryParams["severities"] = params.severities;

      const data = await client.get<IssuesSearchResponse>(
        "/api/issues/search",
        queryParams,
      );

      // Killer feature: echo query parameters so numbers match the UI
      const result = {
        _queryParams: queryParams,
        total: data.total,
        paging: data.paging,
        issues: data.issues,
        components: data.components,
        facets: data.facets,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
