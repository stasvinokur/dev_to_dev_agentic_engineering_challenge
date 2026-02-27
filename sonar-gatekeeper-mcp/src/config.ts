import { z } from "zod";

const configSchema = z.object({
  sonar: z.object({
    url: z
      .string()
      .url()
      .default("http://localhost:9000")
      .describe("SonarQube server URL"),
    token: z.string().optional().describe("SonarQube authentication token (auto-generated if not set)"),
    projectKey: z
      .string()
      .min(1)
      .default("sonar-gatekeeper-mcp")
      .describe("SonarQube project key"),
  }),
  ollama: z.object({
    host: z
      .string()
      .url()
      .default("http://localhost:11434")
      .describe("Ollama server URL"),
    model: z
      .string()
      .min(1)
      .default("qwen2.5-coder:1.5b")
      .describe("Ollama model name"),
  }),
  langfuse: z.object({
    host: z
      .string()
      .url()
      .default("http://localhost:3000")
      .describe("Langfuse server URL"),
    publicKey: z.string().optional().default("").describe("Langfuse public key"),
    secretKey: z.string().optional().default("").describe("Langfuse secret key"),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const raw = {
    sonar: {
      url: process.env["SONAR_URL"],
      token: process.env["SONAR_TOKEN"],
      projectKey: process.env["SONAR_PROJECT_KEY"],
    },
    ollama: {
      host: process.env["OLLAMA_HOST"],
      model: process.env["OLLAMA_MODEL"],
    },
    langfuse: {
      host: process.env["LANGFUSE_HOST"],
      publicKey: process.env["LANGFUSE_PUBLIC_KEY"],
      secretKey: process.env["LANGFUSE_SECRET_KEY"],
    },
  };

  const result = configSchema.safeParse(raw);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${missing}`);
  }

  return result.data;
}
