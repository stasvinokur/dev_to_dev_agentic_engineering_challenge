import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LanguageModel } from "ai";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { PipelineContext } from "../agents/types.ts";
import { runPipeline } from "../agents/orchestrator.ts";
import { getLangfuse } from "../agents/tracing.ts";

const schema = {
  projectKey: z.string().describe("SonarQube project key to analyze"),
};

export function buildFullReport(context: PipelineContext, steps: string[]): string {
  const sections: string[] = [
    "# Пайплайн завершён",
    "",
    "## Шаги",
    ...steps.map((s) => `- ${s}`),
    "",
    "## Итоги",
    `- Quality Gate: ${context.collector?.qualityGate.status ?? "неизвестно"}`,
    `- Найдено проблем: ${context.collector?.issues.length ?? 0}`,
    `- Сгенерировано патчей: ${context.fix?.patches.length ?? 0}`,
    `- Не исправлено: ${context.fix?.unfixable.length ?? 0}`,
    `- Верификация: ${context.verifier?.passed ? "ПРОЙДЕНА" : "НЕ ПРОЙДЕНА"}`,
  ];

  // Triage Groups
  if (context.triage && context.triage.groups.length > 0) {
    sections.push("", "## Группы триажа", "");
    for (const g of context.triage.groups) {
      sections.push(
        `### ${g.priority.toUpperCase()}: ${g.category}`,
        `- Стратегия: **${g.fixStrategy}** | Сложность: **${g.estimatedEffort}**`,
        `- Проблемы: ${g.issueKeys.join(", ")}`,
        "",
      );
    }
  }

  // Patches
  if (context.fix && context.fix.patches.length > 0) {
    sections.push("## Патчи", "");
    for (const p of context.fix.patches) {
      sections.push(
        `### \`${p.filePath}\` — ${p.issueKey}`,
        p.description,
        "",
        "```diff",
        ...p.original.split("\n").map((line) => `- ${line}`),
        ...p.replacement.split("\n").map((line) => `+ ${line}`),
        "```",
        "",
      );
    }
  }

  // Unfixable Issues
  if (context.fix && context.fix.unfixable.length > 0) {
    sections.push("## Нерешённые проблемы (требуют ручной проверки)", "");
    for (const u of context.fix.unfixable) {
      sections.push(`- **${u.issueKey}**: ${u.reason}`);
    }
    sections.push("");
  }

  // PR Description
  sections.push(
    "## Описание PR",
    "",
    context.reporter?.markdown ?? "(отчёт не сформирован)",
    "",
    "---",
    "*Отчёт сгенерирован SonarGatekeeper Pipeline*",
  );

  return sections.join("\n");
}

export function registerPipelineTool(
  server: McpServer,
  client: SonarQubeClient,
  model: LanguageModel,
  projectRoot: string,
) {
  server.tool(
    "pipeline.run",
    "Run the full SonarGatekeeper pipeline: Collector → Triage → Fix → Verifier → Reporter. Analyzes quality gate issues, generates fixes, verifies them, and produces a PR description.",
    schema,
    async (params) => {
      const langfuse = getLangfuse();
      const trace = langfuse?.trace({
        name: "sonar-gatekeeper-pipeline",
        metadata: { projectKey: params.projectKey },
      });

      const steps: string[] = [];

      try {
        const context = await runPipeline({
          client,
          model,
          projectKey: params.projectKey,
          projectRoot,
          onStep: (step, status, detail) => {
            const msg = `[${step}] ${status}${detail ? `: ${detail}` : ""}`;
            steps.push(msg);

            // Log to Langfuse trace
            if (trace) {
              trace.event({
                name: `${step}.${status}`,
                metadata: { detail },
              });
            }
          },
        });

        const output = buildFullReport(context, steps);

        // Save report to file
        const reportPath = resolve(projectRoot, "pipeline-report.md");
        try {
          await writeFile(reportPath, output, "utf-8");
        } catch {
          // Non-critical: report still returned in MCP response
        }

        if (trace) {
          trace.update({ output });
        }

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (e) {
        const stepList = steps.map((s) => `- ${s}`).join("\n");
        const errorMsg = `Пайплайн упал: ${e instanceof Error ? e.message : String(e)}\n\nВыполненные шаги:\n${stepList}`;

        if (trace) {
          trace.update({
            output: errorMsg,
            metadata: { error: true },
          });
        }

        return {
          content: [{ type: "text" as const, text: errorMsg }],
          isError: true,
        };
      } finally {
        if (langfuse) {
          await langfuse.flushAsync();
        }
      }
    },
  );
}
