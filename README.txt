SonarGatekeeper MCP Server
==========================

MCP-сервер, который помогает разработчику пройти путь от «quality gate упал»
до готового PR — за 5-10 минут, полностью локально.


КАКУЮ БОЛЬ РЕШАЕТ
-----------------

Quality gate в SonarQube сломался — что дальше? Обычный сценарий:

1. Открыть SonarQube UI, пролистать десятки issues
2. Прочитать описание каждого правила
3. Найти нужные файлы, понять контекст
4. Написать минимальный фикс для каждого issue
5. Проверить что ничего не сломалось
6. Написать PR-описание

SonarGatekeeper автоматизирует шаги 1-6 через pipeline из 5 AI-агентов.


ДЛЯ КОГО
---------

Разработчики, у которых SonarQube в CI/CD и которые регулярно чинят quality gate.


РЕАЛИЗОВАННЫЕ ИНСТРУМЕНТЫ (7 tools)
------------------------------------

  sonar.get_quality_gate_status  — Статус quality gate проекта
  sonar.search_issues            — Поиск открытых issues с фильтрацией
  sonar.get_rule                 — Детали правила SonarQube (описание, как исправить)
  repo.locate                    — Исходный код файла с номерами строк
  repo.propose_patch             — Генерация unified diff патча
  repo.run_checks                — Запуск тестов, линтинга, форматирования
  pipeline.run                   — Полный pipeline: 5 агентов последовательно


================================================================================
БЫСТРЫЙ СТАРТ
================================================================================

Шаг 1. Сборка образа
---------------------

  docker build -t sonar-gatekeeper .


Шаг 2. Smoke-тест
------------------

  docker run sonar-gatekeeper smoke

Ожидаемый вывод:

  [smoke] Checking /health...
  [smoke] /health OK
  [smoke] Checking /mcp...
  [smoke] /mcp OK
  [smoke] PASSED


Шаг 3. Запуск сервера
----------------------

  docker run -p 8000:8000 sonar-gatekeeper serve


Шаг 4. Проверка /health
------------------------

  curl http://localhost:8000/health

Ожидаемый ответ:

  {"status":"ok","service":"sonar-gatekeeper","version":"1.0.0",
   "transport":"streamable-http","tools":7}


Шаг 5. Подключение через MCP Inspector
---------------------------------------

  npx @modelcontextprotocol/inspector --transport streamablehttp --url http://localhost:8000/mcp

Inspector откроется в браузере. Вы увидите 7 инструментов, сможете вызвать
любой из них.


================================================================================
КАК ИСПОЛЬЗОВАТЬ
================================================================================

sonar.get_quality_gate_status
-----------------------------

Получить статус quality gate для проекта.

Параметры:
  projectKey   (string, обязательный)  — Ключ проекта SonarQube
  branch       (string, нет)           — Имя ветки
  pullRequest  (string, нет)           — ID пулл-реквеста

Результат:

  {
    "projectStatus": {
      "status": "ERROR",
      "conditions": [
        { "status": "ERROR", "metricKey": "new_reliability_rating",
          "comparator": "GT", "errorThreshold": "1", "actualValue": "3" }
      ]
    }
  }


sonar.search_issues
-------------------

Поиск issues в проекте. Возвращает issues с фильтрацией по severity и quality.

Параметры:
  projectKey              (string, обязательный)  — Ключ проекта
  resolved                (boolean, нет)           — Фильтр resolved/unresolved (default: false)
  impactSeverities        (string[], нет)          — LOW, MEDIUM, HIGH, BLOCKER
  impactSoftwareQualities (string[], нет)          — MAINTAINABILITY, RELIABILITY, SECURITY
  pageSize                (number, нет)            — Результатов на странице (default: 100)
  page                    (number, нет)            — Номер страницы (default: 1)

Результат:

  {
    "total": 15,
    "issues": [
      {
        "key": "AZy...",
        "rule": "typescript:S3516",
        "severity": "BLOCKER",
        "component": "demo-project:src/utils.ts",
        "line": 42,
        "message": "Refactor this function to not always return the same value."
      }
    ]
  }


sonar.get_rule
--------------

Получить детали конкретного правила SonarQube.

Параметры:
  ruleKey  (string, обязательный)  — Ключ правила (например typescript:S1481)

Результат:

  {
    "rule": {
      "key": "typescript:S1481",
      "name": "Unused local variables and functions should be removed",
      "htmlDesc": "<p>If a local variable or function is declared but not used...</p>"
    }
  }


repo.locate
------------

Найти файл в репозитории по component key из SonarQube и вернуть исходный код
с номерами строк.

Параметры:
  componentKey  (string, обязательный)  — Component key (например demo-project:src/utils.ts)
  context       (number, нет)           — Строк контекста вокруг issues (default: 5)
  line          (number, нет)           — Центрировать вид вокруг этой строки

Результат:

     40 |   const data = fetchData();
     41 |   // BUG: always returns same value
     42 |   return true;
     43 | }


repo.propose_patch
------------------

Сгенерировать unified diff патч для файла. Не записывает файлы — только
возвращает diff.

Параметры:
  filePath     (string, обязательный)  — Относительный путь к файлу
  original     (string, обязательный)  — Оригинальный контент для замены
  replacement  (string, обязательный)  — Новый контент

Результат:

  --- a/src/utils.ts
  +++ b/src/utils.ts
  @@ -40,3 +40,3 @@
      const data = fetchData();
  -   return true;
  +   return data.isValid;
    }


repo.run_checks
---------------

Запуск проверок качества кода. Автоматически определяет доступные проверки.

Параметры:
  checks  (string[], нет)  — test, lint, format. Автодетект если не указано.

Результат:

  {
    "results": [
      { "check": "test", "passed": true, "output": "14 tests passed" },
      { "check": "lint", "passed": true, "output": "No issues found" }
    ]
  }


pipeline.run
------------

Запуск полного pipeline из 5 агентов. Это основной инструмент для
автоматического исправления quality gate.

Параметры:
  projectKey   (string, обязательный)  — Ключ проекта SonarQube
  projectRoot  (string, нет)           — Путь к корню проекта

Результат: Markdown-отчёт с группировкой issues, патчами, результатами
верификации и PR-описанием. Сохраняется в pipeline-report.md.


================================================================================
АГЕНТНЫЙ PIPELINE (5 агентов)
================================================================================

pipeline.run оркестрирует 5 агентов последовательно:

  Сбор --> Триаж --> Исправление --> Верификация --pass--> Отчёт --> Результат
                                         |
                                       fail --> Исправление (retry, макс. 2 попытки)

1. Сбор (без LLM) — собирает данные из SonarQube: статус quality gate,
   открытые issues, детали правил
2. Триаж (LLM) — группирует issues по корневой причине, приоритизирует,
   выделяет quick wins
3. Исправление (LLM) — генерирует минимальные патчи для высокоприоритетных issues
4. Верификация (без LLM) — запускает тесты, линтинг, форматирование для
   проверки патчей
5. Отчёт (LLM) — генерирует PR-описание с итогами

Пример запуска через MCP:

  > pipeline.run({ projectKey: "demo-project", projectRoot: "/demo_project" })


================================================================================
ОГРАНИЧЕНИЯ И ДОПУЩЕНИЯ
================================================================================

- Языки: TypeScript / JavaScript проекты. Патчи генерируются только для TS/JS.
- SonarQube: self-hosted Community Edition. SonarCloud не поддерживается.
- LLM: qwen2.5-coder:1.5b — маленькая модель (~1 ГБ). Качество патчей
  ограничено размером модели; для сложных задач рекомендуется модель покрупнее.
- Тестовый проект: demo_project/ — 4 файла TypeScript с намеренными code smells
  (20 КБ).
- Docker image: 333 МБ (лимит 500 МБ).
- Ресурсы: работает при CPU 2.0 / RAM 2048 МБ.
- Секреты: токен SonarQube генерируется автоматически, ручная настройка
  не требуется.


================================================================================
РАСШИРЕННЫЙ РЕЖИМ (опционально)
================================================================================

Для полного демо-сценария с SonarQube, Ollama и трассировкой — используйте
Docker Compose.

Docker Compose (полный стек)
----------------------------

  cd sonar-gatekeeper-mcp
  docker compose up -d --wait mcp-server langfuse-web langfuse-worker

--wait дожидается пока указанные сервисы станут healthy. Остальные запускаются
как зависимости. Поднимает:
  - SonarQube:  http://localhost:9000 (admin / SonarAdmin1!)
  - Ollama + модель qwen2.5-coder:1.5b (скачивается автоматически)
  - Автосканирование demo_project (sonar-scanner запускается автоматически)
  - Langfuse v3: http://localhost:3000 (трассировка LLM-вызовов)
  - PostgreSQL, ClickHouse, Redis, MinIO (инфраструктура Langfuse)

Настройка окружения
-------------------

  cp .env.example .env
  # Токен SonarQube генерируется автоматически
  # Ключи Langfuse преднастроены

CLI (без MCP-клиента)
---------------------

  bun install
  bun run src/cli.ts check demo-project --project-root ../demo_project

Подключение через MCP-клиент (stdio)
-------------------------------------

Добавьте в конфигурацию вашего MCP-клиента:

  {
    "mcpServers": {
      "sonar-gatekeeper": {
        "command": "bun",
        "args": ["run", "src/index.ts"],
        "cwd": "/path/to/sonar-gatekeeper-mcp"
      }
    }
  }

Переменные окружения
--------------------

  SONAR_URL            (да)   http://localhost:9000      URL сервера SonarQube
  SONAR_TOKEN          (нет)  авто                       Токен (авто-генерация)
  SONAR_PROJECT_KEY    (нет)  sonar-gatekeeper-mcp       Ключ проекта по умолчанию
  OLLAMA_HOST          (нет)  http://localhost:11434      Endpoint Ollama API
  OLLAMA_MODEL         (нет)  qwen2.5-coder:1.5b         LLM-модель для агентов
  LANGFUSE_HOST        (нет)  http://localhost:3000       Endpoint Langfuse
  LANGFUSE_PUBLIC_KEY  (нет)  —                           Публичный ключ Langfuse
  LANGFUSE_SECRET_KEY  (нет)  —                           Секретный ключ Langfuse
  PROJECT_ROOT         (нет)  process.cwd()               Корень репозитория

Шаблон: .env.example (в папке sonar-gatekeeper-mcp/)

Langfuse трассировка
--------------------

После запуска pipeline откройте http://localhost:3000 — в Langfuse видны трассы
pipeline с отдельными spans для каждого агента (Сбор, Триаж, Исправление, Верификация,
Отчёт) — с входными/выходными данными, ошибками и таймингами.


================================================================================
АРХИТЕКТУРА
================================================================================

Двухслойный дизайн: инструментальный слой (чистый доступ к данным)
и агентный слой (pipeline с LLM).

  +---------------------------------------------------------+
  |  MCP-клиент (любой MCP-совместимый)                     |
  +----------------------------+----------------------------+
                               | MCP Protocol (stdio / HTTP)
  +----------------------------v----------------------------+
  |  СЛОЙ 1: MCP Server (7 инструментов)                    |
  |  - sonar.*  : доступ к SonarQube API                    |
  |  - repo.*   : утилиты для локального репозитория        |
  |  - Без LLM, чистый доступ к данным                      |
  +----------------------------+----------------------------+
                               | Внутренние вызовы
  +----------------------------v----------------------------+
  |  СЛОЙ 2: Agent Orchestrator (pipeline.run)              |
  |  - 5 агентов: Collector > Triage > Fix > Verifier >    |
  |    Reporter                                             |
  |  - LLM: Ollama (локально) через Vercel AI SDK          |
  |  - Трассировка: Langfuse (self-hosted)                  |
  +---------------------------------------------------------+

Принцип: всё работает локально. Никаких облачных зависимостей.


РАЗРАБОТКА
----------

  cd sonar-gatekeeper-mcp
  bun install
  bun test             # 14 тестов
  bunx oxlint .        # линтинг
  bunx oxfmt --check . # форматирование


ТЕХНОЛОГИЧЕСКИЙ СТЕК
--------------------

  Runtime:               Bun (TypeScript, ES Modules)
  MCP SDK:               @modelcontextprotocol/sdk
  LLM:                   Vercel AI SDK 6 + @ai-sdk/openai-compatible (Ollama)
  Валидация:             Zod
  Линтинг/форматирование: oxlint + oxfmt (oxc toolchain)
  Трассировка:           Langfuse v3 (self-hosted)
  Тесты:                 bun:test


ЛИЦЕНЗИЯ
--------

MIT
