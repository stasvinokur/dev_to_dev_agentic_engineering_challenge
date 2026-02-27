import { generateText } from "ai";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageModel } from "ai";
import type { PipelineContext, ReporterResult } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadSkill(): Promise<string> {
  return readFile(resolve(__dirname, "../skills/reporter.md"), "utf-8");
}

export async function runReporter(
  model: LanguageModel,
  context: PipelineContext,
): Promise<ReporterResult> {
  const systemPrompt = await loadSkill();

  const fixSummary =
    context.fix?.patches.map(
      (p) => `- [${p.issueKey}] ${p.filePath}: ${p.description}`,
    ) ?? [];

  const manualSummary =
    context.fix?.unfixable.map(
      (u) => `- [${u.issueKey}]: ${u.reason}`,
    ) ?? [];

  const checkResults =
    context.verifier?.checks.map(
      (c) => `- ${c.name}: ${c.passed ? "PASS" : "FAIL"}`,
    ) ?? [];

  const prompt = `Сгенерируй описание PR на русском языке для следующих исправлений quality gate SonarQube.

Проект: ${context.projectKey}
Quality Gate: ${context.collector?.qualityGate.status ?? "неизвестно"}
Всего найдено проблем: ${context.collector?.issues.length ?? 0}

Итоги триажа: ${context.triage?.summary ?? "Н/Д"}

Применённые исправления (${fixSummary.length}):
${fixSummary.join("\n") || "Нет"}

Проблемы, требующие ручной проверки (${manualSummary.length}):
${manualSummary.join("\n") || "Нет"}

Результаты верификации:
${checkResults.join("\n") || "Не запускались"}
Итого: ${context.verifier?.passed ? "ВСЕ ПРОЙДЕНЫ" : "ЕСТЬ ОШИБКИ"}

Сгенерируй ТОЛЬКО Markdown-описание PR на русском языке. Не оборачивай в блоки кода.`;

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    maxTokens: 2048,
  });

  return { markdown: result.text.trim() };
}
