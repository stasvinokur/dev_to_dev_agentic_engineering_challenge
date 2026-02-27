import type { VerifierResult, VerifierCheck } from "./types.ts";

interface CheckDef {
  name: string;
  command: string[];
}

const CHECKS: CheckDef[] = [
  { name: "test", command: ["bun", "test"] },
  { name: "lint", command: ["bunx", "oxlint", "."] },
  { name: "format", command: ["bunx", "oxfmt", "--check", "."] },
];

async function runCommand(
  command: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

function truncate(text: string, maxLines = 50): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (ещё ${lines.length - maxLines} строк)`
  );
}

export async function runVerifier(
  projectRoot: string,
): Promise<VerifierResult> {
  const checks: VerifierCheck[] = [];
  const feedbackParts: string[] = [];

  for (const check of CHECKS) {
    const { exitCode, stdout, stderr } = await runCommand(
      check.command,
      projectRoot,
    );

    const passed = exitCode === 0;
    const output = truncate(
      [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
    );

    checks.push({ name: check.name, passed, output });

    if (!passed) {
      feedbackParts.push(`${check.name} не пройдена (exit ${exitCode}):\n${output}`);
    }
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    checks,
    feedback: allPassed
      ? "Все проверки пройдены."
      : feedbackParts.join("\n\n"),
  };
}
