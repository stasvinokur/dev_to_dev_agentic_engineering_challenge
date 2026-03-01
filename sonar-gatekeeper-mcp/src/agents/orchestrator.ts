import type { LanguageModel } from "ai";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { PipelineContext } from "./types.ts";
import { runCollector } from "./collector.ts";
import { runTriage } from "./triage.ts";
import { runFix } from "./fix.ts";
import { runVerifier } from "./verifier.ts";
import { runReporter } from "./reporter.ts";
import { getLangfuse } from "./tracing.ts";

export interface PipelineOptions {
  client: SonarQubeClient;
  model: LanguageModel;
  projectKey: string;
  projectRoot: string;
  onStep?: (step: string, status: string, detail?: string) => void;
}

export async function runPipeline(
  options: PipelineOptions,
): Promise<PipelineContext> {
  const { client, model, projectKey, projectRoot, onStep } = options;
  const notify = onStep ?? (() => {});
  const langfuse = getLangfuse();

  const trace = langfuse?.trace({
    name: "pipeline.run",
    metadata: { projectKey, projectRoot },
  });

  const context: PipelineContext = { projectKey, projectRoot };

  // Шаг 1: Сбор данных
  notify("сбор", "старт");
  const collectorSpan = trace?.span({ name: "collector" });
  try {
    context.collector = await runCollector(client, projectKey);
    collectorSpan?.end({ output: { summary: context.collector.summary, issueCount: context.collector.issues.length } });
    notify("сбор", "готово", context.collector.summary);
  } catch (e) {
    collectorSpan?.end({ output: { error: String(e) }, level: "ERROR" });
    notify("сбор", "ошибка", String(e));
    throw e;
  }

  // Ранний выход: нет проблем
  if (context.collector.issues.length === 0) {
    notify("триаж", "готово", "Нет проблем для триажа");
    context.reporter = {
      markdown:
        "## Итоги\nQuality gate пройден. Проблем не найдено. Изменения не нужны.",
    };
    trace?.update({ output: { result: "no_issues" } });
    notify("отчёт", "готово");
    return context;
  }

  // Шаг 2: Триаж
  notify("триаж", "старт");
  const triageSpan = trace?.span({ name: "triage" });
  try {
    context.triage = await runTriage(model, context.collector);
    triageSpan?.end({ output: { summary: context.triage.summary, groupCount: context.triage.groups.length } });
    notify("триаж", "готово", context.triage.summary);
  } catch (e) {
    triageSpan?.end({ output: { error: String(e) }, level: "ERROR" });
    notify("триаж", "ошибка", String(e));
    throw e;
  }

  // Шаг 3: Исправление
  notify("исправление", "старт");
  const fixSpan = trace?.span({ name: "fix" });
  try {
    context.fix = await runFix(
      model,
      context.collector.issues,
      context.triage,
      projectRoot,
    );
    fixSpan?.end({ output: { summary: context.fix.summary, patchCount: context.fix.patches.length } });
    notify("исправление", "готово", context.fix.summary);
  } catch (e) {
    fixSpan?.end({ output: { error: String(e) }, level: "ERROR" });
    notify("исправление", "ошибка", String(e));
    throw e;
  }

  // Шаг 4: Верификация
  notify("верификация", "старт");
  const verifySpan = trace?.span({ name: "verifier" });
  try {
    context.verifier = await runVerifier(projectRoot);
    const verifyMsg = context.verifier.passed ? "Все проверки пройдены" : "Некоторые проверки не пройдены";
    verifySpan?.end({ output: { passed: context.verifier.passed, results: context.verifier.results } });
    notify("верификация", "готово", verifyMsg);
  } catch (e) {
    verifySpan?.end({ output: { error: String(e) }, level: "ERROR" });
    notify("верификация", "ошибка", String(e));
    throw e;
  }

  // Повтор исправления если верификация не прошла (макс 1 попытка)
  if (!context.verifier.passed && context.fix.patches.length > 0) {
    notify("исправление", "старт", "Повтор после ошибки верификации");
    const retrySpan = trace?.span({ name: "fix-retry" });
    try {
      context.fix = await runFix(
        model,
        context.collector.issues,
        context.triage,
        projectRoot,
      );
      notify("исправление", "готово", `Повтор: ${context.fix.summary}`);

      notify("верификация", "старт", "Повторная верификация");
      context.verifier = await runVerifier(projectRoot);
      retrySpan?.end({ output: { passed: context.verifier.passed, summary: context.fix.summary } });
      notify(
        "верификация",
        "готово",
        context.verifier.passed
          ? "Повторная верификация пройдена"
          : "Повторная верификация не пройдена",
      );
    } catch (e) {
      retrySpan?.end({ output: { error: String(e) }, level: "ERROR" });
      notify("исправление", "ошибка", `Повтор не удался: ${String(e)}`);
    }
  }

  // Шаг 5: Отчёт
  notify("отчёт", "старт");
  const reporterSpan = trace?.span({ name: "reporter" });
  try {
    context.reporter = await runReporter(model, context);
    reporterSpan?.end({ output: { length: context.reporter?.markdown?.length ?? 0 } });
    notify("отчёт", "готово");
  } catch (e) {
    reporterSpan?.end({ output: { error: String(e) }, level: "ERROR" });
    notify("отчёт", "ошибка", String(e));
    throw e;
  }

  trace?.update({
    output: {
      issueCount: context.collector.issues.length,
      patchCount: context.fix?.patches.length ?? 0,
      verificationPassed: context.verifier?.passed ?? false,
    },
  });

  return context;
}
