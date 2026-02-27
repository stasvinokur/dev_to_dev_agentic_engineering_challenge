import type { Config } from "../config.ts";
import { SonarQubeClient } from "./client.ts";
import { resolveToken } from "./token-provider.ts";

export function createSonarClient(config: Config): SonarQubeClient {
  return new SonarQubeClient(config.sonar.url, config.sonar.token ?? "");
}

export async function createSonarClientWithAutoToken(
  config: Config,
): Promise<SonarQubeClient> {
  const token = await resolveToken(config.sonar.url);
  return new SonarQubeClient(config.sonar.url, token);
}
