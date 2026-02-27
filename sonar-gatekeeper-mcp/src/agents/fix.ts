import { generateText } from "ai";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageModel } from "ai";
import type { CollectorIssue, TriageResult, FixResult, FixPatch } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadSkill(): Promise<string> {
  return readFile(resolve(__dirname, "../skills/fix.md"), "utf-8");
}

async function readSourceContext(
  projectRoot: string,
  filePath: string,
  line: number | undefined,
  contextLines = 10,
): Promise<string> {
  try {
    const content = await readFile(resolve(projectRoot, filePath), "utf-8");
    const lines = content.split("\n");

    if (line === undefined) {
      return lines
        .slice(0, 30)
        .map((l, i) => `${String(i + 1).padStart(4)} | ${l}`)
        .join("\n");
    }

    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);

    return lines
      .slice(start, end)
      .map((l, i) => `${String(start + i + 1).padStart(4)} | ${l}`)
      .join("\n");
  } catch {
    return "(файл не читается)";
  }
}

export async function runFix(
  model: LanguageModel,
  issues: CollectorIssue[],
  triageResult: TriageResult,
  projectRoot: string,
): Promise<FixResult> {
  // Filter to auto-fixable issues only
  const autoFixKeys = new Set(
    triageResult.groups
      .filter((g) => g.fixStrategy === "auto")
      .flatMap((g) => g.issueKeys),
  );

  const fixableIssues = issues.filter((i) => autoFixKeys.has(i.key));
  const manualIssues = issues.filter((i) => !autoFixKeys.has(i.key));

  if (fixableIssues.length === 0) {
    return {
      patches: [],
      unfixable: manualIssues.map((i) => ({
        issueKey: i.key,
        reason: "Отмечено для ручной проверки триажем",
      })),
      summary: "Авто-исправляемых проблем не найдено.",
    };
  }

  const systemPrompt = await loadSkill();
  const patches: FixPatch[] = [];
  const unfixable: { issueKey: string; reason: string }[] = [];

  // Process issues in batches by file for context efficiency
  const byFile = new Map<string, CollectorIssue[]>();
  for (const issue of fixableIssues) {
    const group = byFile.get(issue.filePath) ?? [];
    group.push(issue);
    byFile.set(issue.filePath, group);
  }

  for (const [filePath, fileIssues] of byFile) {
    const issueDescriptions = await Promise.all(
      fileIssues.map(async (issue) => {
        const source = await readSourceContext(
          projectRoot,
          filePath,
          issue.line,
        );
        return `Issue key: ${issue.key}
Rule: ${issue.rule} — ${issue.ruleDetail?.name ?? issue.message}
Line: ${issue.line ?? "unknown"}
Message: ${issue.message}

Source context:
${source}`;
      }),
    );

    const prompt = `Fix the following ${fileIssues.length} issue(s) in file \`${filePath}\`:

${issueDescriptions.join("\n\n---\n\n")}

For each issue, return a JSON array of fix objects:
[{
  "issueKey": "the issue key",
  "filePath": "${filePath}",
  "original": "exact original code to replace",
  "replacement": "the fixed code",
  "description": "one-line description",
  "fixable": true
}]

If an issue cannot be safely auto-fixed, use:
{ "issueKey": "key", "fixable": false, "reason": "why" }

Return ONLY the JSON array.`;

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        maxTokens: 4096,
      });

      let jsonText = result.text.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        jsonText = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonText) as Array<{
        issueKey: string;
        filePath?: string;
        original?: string;
        replacement?: string;
        description?: string;
        fixable: boolean;
        reason?: string;
      }>;

      for (const item of parsed) {
        if (item.fixable && item.original && item.replacement) {
          patches.push({
            issueKey: item.issueKey,
            filePath: item.filePath ?? filePath,
            original: item.original,
            replacement: item.replacement,
            description: item.description ?? "Авто-исправление",
            fixable: true,
          });
        } else {
          unfixable.push({
            issueKey: item.issueKey,
            reason: item.reason ?? "Агент не смог сгенерировать безопасное исправление",
          });
        }
      }
    } catch {
      // If LLM fails for this batch, mark all as unfixable
      for (const issue of fileIssues) {
        unfixable.push({
          issueKey: issue.key,
          reason: "LLM не смог сгенерировать исправление",
        });
      }
    }
  }

  // Add manual issues
  for (const issue of manualIssues) {
    unfixable.push({
      issueKey: issue.key,
      reason: "Отмечено для ручной проверки триажем",
    });
  }

  return {
    patches,
    unfixable,
    summary: `Сгенерировано ${patches.length} патчей. ${unfixable.length} проблем требуют ручной проверки.`,
  };
}
