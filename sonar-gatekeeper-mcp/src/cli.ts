#!/usr/bin/env bun
/**
 * SonarGatekeeper CLI — run the agent pipeline from the terminal.
 *
 * Usage:
 *   bun run src/cli.ts check <projectKey> [--project-root <path>]
 *
 * Requires Docker services (SonarQube, Ollama, Langfuse) and .env configured.
 */
import { readFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Load .env from the package root (relative to this script) so the CLI
// works when invoked from any directory, not just sonar-gatekeeper-mcp/.
const pkgRoot = resolve(import.meta.dir, "..");
const envPath = resolve(pkgRoot, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Don't override env vars that are already set
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

import { loadConfig } from "./config.ts";
import { createSonarClientWithAutoToken } from "./sonar/client-factory.ts";
import { createOllamaModel } from "./llm/provider.ts";
import { initLangfuse, shutdownLangfuse } from "./agents/tracing.ts";
import { runPipeline } from "./agents/orchestrator.ts";
import { buildFullReport } from "./tools/pipeline.ts";

function printUsage() {
  console.log(`SonarGatekeeper CLI

Использование:
  bun run src/cli.ts check <projectKey> [параметры]

Параметры:
  --project-root <path>  Путь к корню проекта (по умолчанию: cwd)

Примеры:
  bun run src/cli.ts check demo-project --project-root ../demo_project
  bun run src/cli.ts check my-app`);
}

function parseArgs(argv: string[]): {
  command: string;
  projectKey: string;
  projectRoot: string;
} | null {
  // argv: [bun, script, command, ...args]
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return null;
  }

  const command = args[0]!;
  if (command !== "check") {
    console.error(`Неизвестная команда: ${command}\n`);
    return null;
  }

  const projectKey = args[1];
  if (!projectKey) {
    console.error("Не указан <projectKey>\n");
    return null;
  }

  let projectRoot = process.cwd();
  const rootIdx = args.indexOf("--project-root");
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    projectRoot = resolve(args[rootIdx + 1]!);
  }

  return { command, projectKey, projectRoot };
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed) {
    printUsage();
    process.exit(1);
  }

  const { projectKey, projectRoot } = parsed;

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.error(
      `Ошибка конфигурации: ${e instanceof Error ? e.message : String(e)}`,
    );
    console.error("\nУбедитесь что .env настроен. См. .env.example.");
    process.exit(1);
  }

  const client = await createSonarClientWithAutoToken(config);
  const model = createOllamaModel(config);
  initLangfuse(config);

  console.log(`\nПайплайн SonarGatekeeper`);
  console.log(`Проект: ${projectKey}`);
  console.log(`Корень: ${projectRoot}\n`);

  const steps: string[] = [];

  try {
    const context = await runPipeline({
      client,
      model,
      projectKey,
      projectRoot,
      onStep: (step, status, detail) => {
        const msg = `[${step}] ${status}${detail ? `: ${detail}` : ""}`;
        steps.push(msg);
        console.log(msg);
      },
    });

    const output = buildFullReport(context, steps);

    // Save report
    const reportPath = resolve(projectRoot, "pipeline-report.md");
    await writeFile(reportPath, output, "utf-8");

    console.log(`\n${"=".repeat(60)}`);
    console.log(output);
    console.log(`\nОтчёт сохранён: ${reportPath}`);
  } catch (e) {
    console.error(
      `\nПайплайн упал: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  } finally {
    await shutdownLangfuse();
  }
}

await main();
