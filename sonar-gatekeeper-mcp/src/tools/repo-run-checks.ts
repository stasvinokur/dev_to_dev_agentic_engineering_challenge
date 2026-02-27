import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const schema = {
  checks: z
    .array(z.enum(["test", "lint", "format"]))
    .optional()
    .describe(
      "Specific checks to run. If omitted, auto-detects available checks (test, lint, format).",
    ),
};

interface CheckResult {
  check: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCommand(
  command: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Ensure bun's bin directory is in PATH so bunx/oxlint are found
  const bunDir = resolve(process.execPath, "..");
  const currentPath = process.env["PATH"] ?? "";
  const env = {
    ...process.env,
    PATH: currentPath.includes(bunDir)
      ? currentPath
      : `${bunDir}:${currentPath}`,
  };

  const proc = Bun.spawn(command, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

function detectChecks(projectRoot: string): string[] {
  const checks: string[] = [];
  const pkgPath = resolve(projectRoot, "package.json");

  if (existsSync(pkgPath)) {
    checks.push("test");
  }

  // oxlint available?
  const oxlintConfig = resolve(projectRoot, "oxlintrc.json");
  if (existsSync(oxlintConfig)) {
    checks.push("lint");
    checks.push("format");
  }

  return checks;
}

const CHECK_COMMANDS: Record<string, string[]> = {
  test: ["bun", "test"],
  lint: ["bunx", "oxlint", "."],
  format: ["bunx", "oxfmt", "--check", "."],
};

const CHECK_LABELS: Record<string, string> = {
  test: "bun test",
  lint: "oxlint .",
  format: "oxfmt --check .",
};

export function registerRunChecksTool(
  server: McpServer,
  projectRoot: string,
) {
  server.tool(
    "repo.run_checks",
    "Run code quality checks (tests, linting, formatting) on the repository. Auto-detects available checks based on project configuration.",
    schema,
    async (params) => {
      const checksToRun = params.checks ?? detectChecks(projectRoot);

      if (checksToRun.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No checks detected for this project.",
            },
          ],
        };
      }

      const results: CheckResult[] = [];

      for (const check of checksToRun) {
        const command = CHECK_COMMANDS[check];
        if (!command) continue;

        const { exitCode, stdout, stderr } = await runCommand(
          command,
          projectRoot,
        );

        results.push({
          check,
          command: CHECK_LABELS[check] ?? command.join(" "),
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      }

      const allPassed = results.every((r) => r.exitCode === 0);
      const summary = results
        .map(
          (r) =>
            `## ${r.check} (${r.exitCode === 0 ? "PASS" : "FAIL"})\n` +
            `Command: \`${r.command}\`\n` +
            `Exit code: ${r.exitCode}\n` +
            (r.stdout ? `\n\`\`\`\n${r.stdout}\n\`\`\`\n` : "") +
            (r.stderr ? `\nStderr:\n\`\`\`\n${r.stderr}\n\`\`\`\n` : ""),
        )
        .join("\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `# Check Results: ${allPassed ? "ALL PASSED" : "SOME FAILED"}\n\n${summary}`,
          },
        ],
      };
    },
  );
}
