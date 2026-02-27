import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { SonarQubeClient, SonarQubeError } from "../src/sonar/client.ts";

// Mock HTTP server
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("Authorization");

      if (auth !== "Bearer test-token") {
        return new Response(JSON.stringify({ errors: [{ msg: "Unauthorized" }] }), {
          status: 401,
        });
      }

      if (url.pathname === "/api/system/status") {
        return Response.json({ status: "UP" });
      }

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
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

describe("SonarQubeClient", () => {
  it("should ping successfully with valid token", async () => {
    const client = new SonarQubeClient(baseUrl, "test-token");
    const result = await client.ping();
    expect(result).toBe(true);
  });

  it("should return false for ping with unreachable server", async () => {
    const client = new SonarQubeClient("http://localhost:1", "test-token");
    const result = await client.ping();
    expect(result).toBe(false);
  });

  it("should fetch quality gate status", async () => {
    const client = new SonarQubeClient(baseUrl, "test-token");
    const result = await client.get<{ projectStatus: { status: string } }>(
      "/api/qualitygates/project_status",
      { projectKey: "test" },
    );
    expect(result.projectStatus.status).toBe("OK");
  });

  it("should throw SonarQubeError on 401", async () => {
    const client = new SonarQubeClient(baseUrl, "bad-token");
    try {
      await client.get("/api/qualitygates/project_status");
      expect(true).toBe(false); // Should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(SonarQubeError);
      expect((e as SonarQubeError).status).toBe(401);
      expect((e as SonarQubeError).message).toContain("Authentication failed");
    }
  });

  it("should throw SonarQubeError on 404", async () => {
    const client = new SonarQubeClient(baseUrl, "test-token");
    try {
      await client.get("/api/nonexistent");
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(SonarQubeError);
      expect((e as SonarQubeError).status).toBe(404);
    }
  });

  it("should strip trailing slashes from base URL", async () => {
    const client = new SonarQubeClient(baseUrl + "///", "test-token");
    const result = await client.ping();
    expect(result).toBe(true);
  });
});
