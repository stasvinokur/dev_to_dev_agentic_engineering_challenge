import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Config } from "../config.ts";

export function createOllamaProvider(config: Config) {
  return createOpenAICompatible({
    name: "ollama",
    baseURL: `${config.ollama.host}/v1`,
  });
}

export function createOllamaModel(config: Config) {
  const provider = createOllamaProvider(config);
  return provider.chatModel(config.ollama.model);
}
