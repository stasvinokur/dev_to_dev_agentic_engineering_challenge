export class SonarQubeError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "SonarQubeError";
  }
}

export class SonarQubeClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SonarQubeError(
        this.formatError(response.status, path, body),
        response.status,
        path,
      );
    }

    return (await response.json()) as T;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/system/status`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private formatError(status: number, endpoint: string, body: string): string {
    const messages: Record<number, string> = {
      401: "Authentication failed — check SONAR_TOKEN",
      403: "Insufficient permissions for this operation",
      404: `Resource not found: ${endpoint}`,
      500: "SonarQube internal server error",
    };

    const base =
      messages[status] ?? `SonarQube API error (HTTP ${status}): ${endpoint}`;

    let detail = "";
    try {
      const parsed = JSON.parse(body) as { errors?: { msg: string }[] };
      if (parsed.errors?.length) {
        detail = ` — ${parsed.errors.map((e) => e.msg).join("; ")}`;
      }
    } catch {
      // body is not JSON, ignore
    }

    return `${base}${detail}`;
  }
}
