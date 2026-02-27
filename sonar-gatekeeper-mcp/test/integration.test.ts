import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { runCollector } from "../src/agents/collector.ts";
import { SonarQubeClient } from "../src/sonar/client.ts";

// Mock SonarQube for integration tests
let mockServer: ReturnType<typeof Bun.serve>;
let mockBaseUrl: string;

beforeAll(() => {
  mockServer = Bun.serve({
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
                metricKey: "new_reliability_rating",
                comparator: "GT",
                errorThreshold: "1",
                actualValue: "3",
              },
            ],
            ignoredConditions: false,
            caycStatus: "non-compliant",
          },
        });
      }

      if (url.pathname === "/api/issues/search") {
        return Response.json({
          total: 2,
          p: 1,
          ps: 100,
          paging: { pageIndex: 1, pageSize: 100, total: 2 },
          effortTotal: 15,
          issues: [
            {
              key: "ISSUE-1",
              rule: "typescript:S1481",
              component: "project:src/utils.ts",
              project: "project",
              line: 5,
              message: "Remove the declaration of the unused variable 'temp'.",
              status: "OPEN",
              flows: [],
              tags: [],
              impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "LOW" }],
              creationDate: "2026-01-01",
              updateDate: "2026-01-01",
            },
            {
              key: "ISSUE-2",
              rule: "typescript:S3776",
              component: "project:src/handler.ts",
              project: "project",
              line: 42,
              message: "Refactor this function to reduce its Cognitive Complexity.",
              status: "OPEN",
              flows: [],
              tags: [],
              impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "MEDIUM" }],
              creationDate: "2026-01-01",
              updateDate: "2026-01-01",
            },
          ],
          components: [],
          facets: [],
        });
      }

      if (url.pathname === "/api/rules/search") {
        const ruleKey = url.searchParams.get("rule_key");
        if (ruleKey === "typescript:S1481") {
          return Response.json({
            total: 1,
            p: 1,
            ps: 1,
            paging: { pageIndex: 1, pageSize: 1, total: 1 },
            rules: [
              {
                key: "typescript:S1481",
                repo: "typescript",
                name: "Unused local variables should be removed",
                createdAt: "2026-01-01",
                updatedAt: "2026-01-01",
                status: "READY",
                isTemplate: false,
                tags: [],
                sysTags: [],
                params: [],
                scope: "ALL",
                isExternal: false,
                descriptionSections: [],
                educationPrinciples: [],
                impacts: [{ softwareQuality: "MAINTAINABILITY", severity: "LOW" }],
              },
            ],
          });
        }
        return Response.json({
          total: 0,
          p: 1,
          ps: 1,
          paging: { pageIndex: 1, pageSize: 1, total: 0 },
          rules: [],
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });
  mockBaseUrl = `http://localhost:${mockServer.port}`;
});

afterAll(() => {
  mockServer.stop();
});

describe("Pipeline integration", () => {
  it("collector should gather quality gate, issues, and rules", async () => {
    const client = new SonarQubeClient(mockBaseUrl, "token");
    const result = await runCollector(client, "project");

    expect(result.qualityGate.status).toBe("ERROR");
    expect(result.qualityGate.conditions).toHaveLength(1);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]!.filePath).toBe("src/utils.ts");
    expect(result.issues[1]!.filePath).toBe("src/handler.ts");
    expect(result.rules.size).toBe(1); // Only S1481 found, S3776 returns 0
    expect(result.rules.get("typescript:S1481")?.name).toBe(
      "Unused local variables should be removed",
    );
    expect(result.summary).toContain("ERROR");
    expect(result.summary).toContain("2");
  });

  it("collector should handle project with no issues", async () => {
    // Create a server that returns 0 issues
    const emptyServer = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/qualitygates/project_status") {
          return Response.json({
            projectStatus: {
              status: "OK",
              conditions: [],
              ignoredConditions: false,
              caycStatus: "compliant",
            },
          });
        }
        if (url.pathname === "/api/issues/search") {
          return Response.json({
            total: 0,
            p: 1,
            ps: 100,
            paging: { pageIndex: 1, pageSize: 100, total: 0 },
            effortTotal: 0,
            issues: [],
            components: [],
            facets: [],
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    try {
      const client = new SonarQubeClient(
        `http://localhost:${emptyServer.port}`,
        "token",
      );
      const result = await runCollector(client, "clean-project");

      expect(result.qualityGate.status).toBe("OK");
      expect(result.issues).toHaveLength(0);
      expect(result.rules.size).toBe(0);
    } finally {
      emptyServer.stop();
    }
  });
});
