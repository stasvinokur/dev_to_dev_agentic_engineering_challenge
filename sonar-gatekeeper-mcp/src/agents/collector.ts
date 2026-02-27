import type { SonarQubeClient } from "../sonar/client.ts";
import type {
  QualityGateResponse,
  IssuesSearchResponse,
  RulesSearchResponse,
  Rule,
} from "../sonar/types.ts";
import type { CollectorResult, CollectorIssue } from "./types.ts";

export async function runCollector(
  client: SonarQubeClient,
  projectKey: string,
): Promise<CollectorResult> {
  // 1. Quality gate
  const qg = await client.get<QualityGateResponse>(
    "/api/qualitygates/project_status",
    { projectKey },
  );

  // 2. Fetch all open issues (paginate)
  const allIssues: CollectorIssue[] = [];
  let page = 1;
  const pageSize = 100;
  let total = 0;

  do {
    const result = await client.get<IssuesSearchResponse>(
      "/api/issues/search",
      {
        componentKeys: projectKey,
        resolved: "false",
        ps: String(pageSize),
        p: String(page),
      },
    );

    total = result.total;

    for (const issue of result.issues) {
      // Extract file path from component key
      const colonIdx = issue.component.indexOf(":");
      const filePath =
        colonIdx !== -1 ? issue.component.substring(colonIdx + 1) : issue.component;

      allIssues.push({ ...issue, filePath });
    }

    page++;
  } while (allIssues.length < total && page <= 10); // Max 10 pages safety

  // 3. Fetch unique rule details
  const ruleKeys = [...new Set(allIssues.map((i) => i.rule))];
  const rules = new Map<string, Rule>();

  for (const ruleKey of ruleKeys) {
    try {
      const result = await client.get<RulesSearchResponse>(
        "/api/rules/search",
        { rule_key: ruleKey, ps: "1" },
      );
      const rule = result.rules[0];
      if (rule) {
        rules.set(ruleKey, rule);
      }
    } catch {
      // Non-critical: skip rule if lookup fails
    }
  }

  // Attach rule details to issues
  for (const issue of allIssues) {
    issue.ruleDetail = rules.get(issue.rule);
  }

  // 4. Summary
  const severityCounts = new Map<string, number>();
  for (const issue of allIssues) {
    for (const impact of issue.impacts) {
      const key = `${impact.softwareQuality}:${impact.severity}`;
      severityCounts.set(key, (severityCounts.get(key) ?? 0) + 1);
    }
  }

  const breakdownParts: string[] = [];
  for (const [key, count] of severityCounts) {
    breakdownParts.push(`${key}: ${count}`);
  }

  const summary = [
    `Quality Gate: ${qg.projectStatus.status}`,
    `Всего открытых проблем: ${total}`,
    breakdownParts.length > 0
      ? `Распределение по влиянию: ${breakdownParts.join(", ")}`
      : "Проблем не найдено",
  ].join("\n");

  return {
    qualityGate: qg.projectStatus,
    issues: allIssues,
    rules,
    summary,
  };
}
