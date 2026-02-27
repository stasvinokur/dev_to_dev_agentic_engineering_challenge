import { generateText } from "ai";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LanguageModel } from "ai";
import type { CollectorResult } from "./types.ts";
import type { TriageResult } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadSkill(): Promise<string> {
  return readFile(resolve(__dirname, "../skills/triage.md"), "utf-8");
}

export async function runTriage(
  model: LanguageModel,
  collectorResult: CollectorResult,
): Promise<TriageResult> {
  if (collectorResult.issues.length === 0) {
    return {
      groups: [],
      summary: "Нет проблем для триажа.",
    };
  }

  const systemPrompt = await loadSkill();

  // Prepare compact issue data for LLM
  const issueData = collectorResult.issues.map((i) => ({
    key: i.key,
    rule: i.rule,
    message: i.message,
    filePath: i.filePath,
    line: i.line,
    impacts: i.impacts,
    severity: i.severity,
    type: i.type,
    ruleName: i.ruleDetail?.name,
  }));

  const prompt = `Here are ${issueData.length} SonarQube issues for the project. Quality gate status: ${collectorResult.qualityGate.status}.

Issues:
${JSON.stringify(issueData, null, 2)}

Analyze and group these issues. Return ONLY a valid JSON object matching this structure:
{
  "groups": [{ "priority": "critical|high|medium|low", "category": "description", "issueKeys": ["key1"], "fixStrategy": "auto|manual", "estimatedEffort": "trivial|simple|moderate|complex" }],
  "summary": "text summary"
}`;

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    maxTokens: 4096,
  });

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = result.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }
    const parsed = JSON.parse(jsonText);
    // Normalize: LLM may return "issues" instead of "issueKeys"
    if (parsed.groups) {
      for (const g of parsed.groups) {
        if (!g.issueKeys && g.issues) {
          g.issueKeys = g.issues;
          delete g.issues;
        }
      }
    }
    return parsed as TriageResult;
  } catch {
    // Fallback: simple grouping by severity
    return {
      groups: [
        {
          priority: "medium" as const,
          category: "Все проблемы (ошибка парсинга LLM)",
          issueKeys: collectorResult.issues.map((i) => i.key),
          fixStrategy: "auto" as const,
          estimatedEffort: "simple" as const,
        },
      ],
      summary: `Резервный триаж: ${collectorResult.issues.length} проблем сгруппировано. Ответ LLM не удалось распарсить.`,
    };
  }
}
