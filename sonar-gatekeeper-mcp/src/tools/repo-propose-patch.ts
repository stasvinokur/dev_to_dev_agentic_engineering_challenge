import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const schema = {
  filePath: z.string().describe("Relative path to the file to patch"),
  original: z
    .string()
    .describe("The original code snippet to be replaced (exact match)"),
  replacement: z
    .string()
    .describe("The replacement code snippet"),
  description: z
    .string()
    .optional()
    .describe("Human-readable description of the change"),
};

function createUnifiedDiff(
  filePath: string,
  originalContent: string,
  newContent: string,
): string {
  const originalLines = originalContent.split("\n");
  const newLines = newContent.split("\n");

  // Find the changed region
  let startLine = 0;
  while (
    startLine < originalLines.length &&
    startLine < newLines.length &&
    originalLines[startLine] === newLines[startLine]
  ) {
    startLine++;
  }

  let endOriginal = originalLines.length;
  let endNew = newLines.length;
  while (
    endOriginal > startLine &&
    endNew > startLine &&
    originalLines[endOriginal - 1] === newLines[endNew - 1]
  ) {
    endOriginal--;
    endNew--;
  }

  // Add context lines (up to 3)
  const contextStart = Math.max(0, startLine - 3);
  const contextEndOriginal = Math.min(originalLines.length, endOriginal + 3);
  const contextEndNew = Math.min(newLines.length, endNew + 3);

  const hunks: string[] = [];
  hunks.push(
    `@@ -${contextStart + 1},${contextEndOriginal - contextStart} +${contextStart + 1},${contextEndNew - contextStart} @@`,
  );

  // Context before
  for (let i = contextStart; i < startLine; i++) {
    hunks.push(` ${originalLines[i]}`);
  }
  // Removed lines
  for (let i = startLine; i < endOriginal; i++) {
    hunks.push(`-${originalLines[i]}`);
  }
  // Added lines
  for (let i = startLine; i < endNew; i++) {
    hunks.push(`+${newLines[i]}`);
  }
  // Context after
  for (let i = endOriginal; i < contextEndOriginal; i++) {
    hunks.push(` ${originalLines[i]}`);
  }

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    ...hunks,
  ].join("\n");
}

export function registerProposePatchTool(
  server: McpServer,
  projectRoot: string,
) {
  server.tool(
    "repo.propose_patch",
    "Generate a unified diff for a proposed code change. Does NOT write any files — returns the diff only.",
    schema,
    async (params) => {
      const absolutePath = resolve(projectRoot, params.filePath);

      let content: string;
      try {
        content = await readFile(absolutePath, "utf-8");
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `File not found: ${params.filePath}`,
            },
          ],
          isError: true,
        };
      }

      if (!content.includes(params.original)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Original code snippet not found in ${params.filePath}. Make sure the snippet matches exactly (including whitespace).`,
            },
          ],
          isError: true,
        };
      }

      const newContent = content.replace(params.original, params.replacement);
      const diff = createUnifiedDiff(params.filePath, content, newContent);

      const header = params.description
        ? `# ${params.description}\n\n`
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `${header}\`\`\`diff\n${diff}\n\`\`\``,
          },
        ],
      };
    },
  );
}
