import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { RulesSearchResponse } from "../sonar/types.ts";

const schema = {
  ruleKey: z
    .string()
    .describe("SonarQube rule key (e.g. typescript:S1234)"),
};

export function registerRuleTool(
  server: McpServer,
  client: SonarQubeClient,
) {
  server.tool(
    "sonar.get_rule",
    "Get the full description and metadata for a SonarQube rule by its key.",
    schema,
    async (params) => {
      const data = await client.get<RulesSearchResponse>(
        "/api/rules/search",
        {
          rule_key: params.ruleKey,
          ps: "1",
        },
      );

      const rule = data.rules[0];
      if (!rule) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Rule not found: ${params.ruleKey}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(rule, null, 2),
          },
        ],
      };
    },
  );
}
