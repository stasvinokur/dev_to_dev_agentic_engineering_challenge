import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SonarQubeClient } from "../src/sonar/client.ts";
import { registerQualityGateTool } from "../src/tools/sonar-quality-gate.ts";
import { registerSearchIssuesTool } from "../src/tools/sonar-search-issues.ts";
import { registerRuleTool } from "../src/tools/sonar-rules.ts";
import { registerLocateTool } from "../src/tools/repo-locate.ts";
import { registerRunChecksTool } from "../src/tools/repo-run-checks.ts";

// Mock SonarQube server
let sonarServer: ReturnType<typeof Bun.serve>;
let sonarBaseUrl: string;

beforeAll(() => {
  sonarServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/qualitygates/project_status") {
        return Response.json({
          projectStatus: {
            status: "ERROR",
            conditions: [
              {
                status: "ERROR",
                metricKey: "new_coverage",
                comparator: "LT",
                errorThreshold: "80",
                actualValue: "42.5",
              },
            ],
            ignoredConditions: false,
            caycStatus: "non-compliant",
          },
        });
      }

      if (url.pathname === "/api/issues/search") {
        return Response.json({
          total: 1,
          p: 1,
          ps: 100,
          paging: { pageIndex: 1, pageSize: 100, total: 1 },
          effortTotal: 5,
          issues: [
            {
              key: "AX123",
              rule: "typescript:S1234",
              component: "test-project:src/index.ts",
              project: "test-project",
              line: 10,
              message: "Remove unused variable",
              status: "OPEN",
              flows: [],
              tags: [],
              impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "LOW" }],
              creationDate: "2026-01-01",
              updateDate: "2026-01-01",
            },
          ],
          components: [
            {
              key: "test-project:src/index.ts",
              enabled: true,
              qualifier: "FIL",
              name: "index.ts",
              longName: "src/index.ts",
              path: "src/index.ts",
            },
          ],
          facets: [],
        });
      }

      if (url.pathname === "/api/rules/search") {
        return Response.json({
          total: 1,
          p: 1,
          ps: 1,
          paging: { pageIndex: 1, pageSize: 1, total: 1 },
          rules: [
            {
              key: "typescript:S1234",
              repo: "typescript",
              name: "Unused variables should be removed",
              createdAt: "2026-01-01",
              updatedAt: "2026-01-01",
              status: "READY",
              isTemplate: false,
              tags: [],
              sysTags: ["unused"],
              params: [],
              scope: "ALL",
              isExternal: false,
              descriptionSections: [
                { key: "root_cause", content: "Unused variables clutter code." },
              ],
              educationPrinciples: [],
              impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "LOW" }],
            },
          ],
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });
  sonarBaseUrl = `http://localhost:${sonarServer.port}`;
});

afterAll(() => {
  sonarServer.stop();
});

describe("sonar.get_quality_gate_status", () => {
  it("should return quality gate status with conditions", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    const client = new SonarQubeClient(sonarBaseUrl, "token");
    registerQualityGateTool(server, client);

    // Access tools through server internals
    const tools = (server as any)._registeredTools;
    const tool = tools["sonar.get_quality_gate_status"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ projectKey: "test" });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.projectStatus.status).toBe("ERROR");
    expect(data.projectStatus.conditions).toHaveLength(1);
  });
});

describe("sonar.search_issues", () => {
  it("should return issues with _queryParams", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    const client = new SonarQubeClient(sonarBaseUrl, "token");
    registerSearchIssuesTool(server, client);

    const tools = (server as any)._registeredTools;
    const tool = tools["sonar.search_issues"];
    expect(tool).toBeDefined();

    const result = await tool.handler({
      projectKey: "test-project",
      resolved: false,
      pageSize: 100,
      page: 1,
    });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data._queryParams).toBeDefined();
    expect(data._queryParams.componentKeys).toBe("test-project");
    expect(data.total).toBe(1);
    expect(data.issues).toHaveLength(1);
  });
});

describe("sonar.get_rule", () => {
  it("should return rule details by key", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    const client = new SonarQubeClient(sonarBaseUrl, "token");
    registerRuleTool(server, client);

    const tools = (server as any)._registeredTools;
    const tool = tools["sonar.get_rule"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ ruleKey: "typescript:S1234" });
    const text = result.content[0].text;
    const data = JSON.parse(text);
    expect(data.key).toBe("typescript:S1234");
    expect(data.name).toBe("Unused variables should be removed");
  });
});

describe("repo.locate", () => {
  it("should locate file from component key", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    const projectRoot = import.meta.dir.replace("/test", "");
    registerLocateTool(server, projectRoot);

    const tools = (server as any)._registeredTools;
    const tool = tools["repo.locate"];
    expect(tool).toBeDefined();

    const result = await tool.handler({
      componentKey: "project:src/index.ts",
      context: 3,
    });
    const text = result.content[0].text;
    expect(text).toContain("File: src/index.ts");
    expect(text).toContain("McpServer");
  });

  it("should return error for missing file", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    registerLocateTool(server, "/tmp/nonexistent");

    const tools = (server as any)._registeredTools;
    const tool = tools["repo.locate"];

    const result = await tool.handler({
      componentKey: "project:no-such-file.ts",
      context: 5,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("File not found");
  });
});

describe("repo.run_checks", () => {
  it("should run lint check on the project", async () => {
    const server = new McpServer({ name: "test", version: "1.0" });
    const projectRoot = import.meta.dir.replace("/test", "");
    registerRunChecksTool(server, projectRoot);

    const tools = (server as any)._registeredTools;
    const tool = tools["repo.run_checks"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ checks: ["lint"] });
    const text = result.content[0].text;
    expect(text).toContain("lint");
    expect(text).toContain("PASS");
  });
});
