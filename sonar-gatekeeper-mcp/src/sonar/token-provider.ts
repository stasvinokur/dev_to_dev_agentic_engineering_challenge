import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SHARED_TOKEN_PATH = "/shared/sonar-token";
const LOCAL_TOKEN_FILE = "sonar-token";
const TOKEN_NAME = "sonar-gatekeeper-auto";

/**
 * Resolves a SonarQube token using this priority:
 * 1. SONAR_TOKEN env var (explicit config)
 * 2. Shared volume file /shared/sonar-token (Docker init container)
 * 3. Local file ./sonar-token (cached from previous auto-provision)
 * 4. Auto-generate via SonarQube API with Basic Auth admin:admin
 */
export async function resolveToken(sonarUrl: string): Promise<string> {
  // 1. Env var
  const envToken = process.env["SONAR_TOKEN"];
  if (envToken) {
    return envToken;
  }

  // 2. Shared volume (Docker)
  if (existsSync(SHARED_TOKEN_PATH)) {
    const token = readFileSync(SHARED_TOKEN_PATH, "utf-8").trim();
    if (token) {
      console.log("[token] Используется токен из /shared/sonar-token");
      return token;
    }
  }

  // 3. Local cached file (validate before using)
  const pkgRoot = resolve(import.meta.dir, "../..");
  const localPath = resolve(pkgRoot, LOCAL_TOKEN_FILE);
  if (existsSync(localPath)) {
    const cached = readFileSync(localPath, "utf-8").trim();
    if (cached) {
      const valid = await validateToken(sonarUrl, cached);
      if (valid) {
        console.log("[token] Используется кэшированный токен из sonar-token");
        return cached;
      }
      console.log("[token] Кэшированный токен невалиден — перегенерация...");
    }
  }

  // 4. Auto-generate via API
  console.log("[token] Генерируем токен автоматически...");
  const token = await generateToken(sonarUrl);

  // Cache locally for next runs
  try {
    writeFileSync(localPath, token, "utf-8");
    console.log(`[token] Токен сохранён в ${localPath}`);
  } catch {
    // Non-critical — may fail in read-only container
  }

  return token;
}

async function validateToken(sonarUrl: string, token: string): Promise<boolean> {
  try {
    const baseUrl = sonarUrl.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/authentication/validate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { valid?: boolean };
    return data.valid === true;
  } catch {
    return false;
  }
}

async function generateToken(sonarUrl: string): Promise<string> {
  const baseUrl = sonarUrl.replace(/\/+$/, "");
  const user = process.env["SONAR_USER"] ?? "admin";
  const pass = process.env["SONAR_PASS"] ?? "SonarAdmin1!";
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  // Revoke existing token with same name (ignore errors)
  try {
    await fetch(`${baseUrl}/api/user_tokens/revoke`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `name=${TOKEN_NAME}`,
    });
  } catch {
    // Token may not exist — safe to ignore
  }

  // Generate new token
  const response = await fetch(`${baseUrl}/api/user_tokens/generate`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `name=${TOKEN_NAME}`,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Не удалось сгенерировать токен SonarQube (HTTP ${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("SonarQube API не вернул токен");
  }

  console.log("[token] Токен сгенерирован автоматически");
  return data.token;
}
