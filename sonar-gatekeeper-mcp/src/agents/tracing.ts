import { Langfuse } from "langfuse";
import type { Config } from "../config.ts";

let langfuseInstance: Langfuse | null = null;

export function initLangfuse(config: Config): Langfuse | null {
  try {
    langfuseInstance = new Langfuse({
      publicKey: config.langfuse.publicKey,
      secretKey: config.langfuse.secretKey,
      baseUrl: config.langfuse.host,
    });
    return langfuseInstance;
  } catch {
    console.error("Failed to initialize Langfuse — tracing disabled");
    return null;
  }
}

export function getLangfuse(): Langfuse | null {
  return langfuseInstance;
}

export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
  }
}
