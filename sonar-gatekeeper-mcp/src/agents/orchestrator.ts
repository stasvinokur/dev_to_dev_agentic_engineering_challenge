import type { LanguageModel } from "ai";
import type { SonarQubeClient } from "../sonar/client.ts";
import type { PipelineContext } from "./types.ts";
import { runCollector } from "./collector.ts";
import { runTriage } from "./triage.ts";
import { runFix } from "./fix.ts";
import { runVerifier } from "./verifier.ts";
import { runReporter } from "./reporter.ts";

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

  const context: PipelineContext = { projectKey, projectRoot };

  // Шаг 1: Сбор данных
  notify("сбор", "старт");
  try {
    context.collector = await runCollector(client, projectKey);
    notify("сбор", "готово", context.collector.summary);
  } catch (e) {
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
    notify("отчёт", "готово");
    return context;
  }

  // Шаг 2: Триаж
  notify("триаж", "старт");
  try {
    context.triage = await runTriage(model, context.collector);
    notify("триаж", "готово", context.triage.summary);
  } catch (e) {
    notify("триаж", "ошибка", String(e));
    throw e;
  }

  // Шаг 3: Исправление
  notify("исправление", "старт");
  try {
    context.fix = await runFix(
      model,
      context.collector.issues,
      context.triage,
      projectRoot,
    );
    notify("исправление", "готово", context.fix.summary);
  } catch (e) {
    notify("исправление", "ошибка", String(e));
    throw e;
  }

  // Шаг 4: Верификация
  notify("верификация", "старт");
  try {
    context.verifier = await runVerifier(projectRoot);
    notify(
      "верификация",
      "готово",
      context.verifier.passed ? "Все проверки пройдены" : "Некоторые проверки не пройдены",
    );
  } catch (e) {
    notify("верификация", "ошибка", String(e));
    throw e;
  }

  // Повтор исправления если верификация не прошла (макс 1 попытка)
  if (!context.verifier.passed && context.fix.patches.length > 0) {
    notify("исправление", "старт", "Повтор после ошибки верификации");
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
      notify(
        "верификация",
        "готово",
        context.verifier.passed
          ? "Повторная верификация пройдена"
          : "Повторная верификация не пройдена",
      );
    } catch (e) {
      notify("исправление", "ошибка", `Повтор не удался: ${String(e)}`);
    }
  }

  // Шаг 5: Отчёт
  notify("отчёт", "старт");
  try {
    context.reporter = await runReporter(model, context);
    notify("отчёт", "готово");
  } catch (e) {
    notify("отчёт", "ошибка", String(e));
    throw e;
  }

  return context;
}
