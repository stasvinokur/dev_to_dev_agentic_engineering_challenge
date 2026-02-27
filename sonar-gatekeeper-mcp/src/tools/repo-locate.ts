import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const schema = {
  componentKey: z
    .string()
    .describe(
      "SonarQube component key (e.g. sonar-gatekeeper-mcp:src/index.ts)",
    ),
  line: z
    .number()
    .optional()
    .describe("Center line for context window (default: start of file)"),
  context: z
    .number()
    .min(0)
    .max(50)
    .default(5)
    .describe("Number of lines of context above and below (default: 5)"),
};

function extractPath(componentKey: string): string {
  // SonarQube component keys: "projectKey:path/to/file"
  const colonIdx = componentKey.indexOf(":");
  if (colonIdx === -1) return componentKey;
  return componentKey.substring(colonIdx + 1);
}

export function registerLocateTool(server: McpServer, projectRoot: string) {
  server.tool(
    "repo.locate",
    "Locate a file from a SonarQube component key and return its source code with line numbers and optional context window around a specific line.",
    schema,
    async (params) => {
      const relativePath = extractPath(params.componentKey);
      const absolutePath = resolve(projectRoot, relativePath);

      let content: string;
      try {
        content = await readFile(absolutePath, "utf-8");
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `File not found: ${relativePath}`,
            },
          ],
          isError: true,
        };
      }

      const lines = content.split("\n");
      const totalLines = lines.length;

      let startLine = 1;
      let endLine = totalLines;

      if (params.line !== undefined) {
        startLine = Math.max(1, params.line - params.context);
        endLine = Math.min(totalLines, params.line + params.context);
      }

      const numberedLines = lines
        .slice(startLine - 1, endLine)
        .map((line, i) => `${String(startLine + i).padStart(4)} | ${line}`)
        .join("\n");

      const header = `File: ${relativePath} (lines ${startLine}-${endLine} of ${totalLines})`;

      return {
        content: [
          {
            type: "text" as const,
            text: `${header}\n\n${numberedLines}`,
          },
        ],
      };
    },
  );
}
