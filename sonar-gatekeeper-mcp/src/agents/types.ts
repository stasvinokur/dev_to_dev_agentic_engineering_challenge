import type { Issue, QualityGateProjectStatus, Rule } from "../sonar/types.ts";

// ── Collector output ──

export interface CollectorResult {
  qualityGate: QualityGateProjectStatus;
  issues: CollectorIssue[];
  rules: Map<string, Rule>;
  summary: string;
}

export interface CollectorIssue extends Issue {
  filePath: string;
  ruleDetail?: Rule;
}

// ── Triage output ──

export interface TriageGroup {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  issueKeys: string[];
  fixStrategy: "auto" | "manual";
  estimatedEffort: "trivial" | "simple" | "moderate" | "complex";
}

export interface TriageResult {
  groups: TriageGroup[];
  summary: string;
}

// ── Fix output ──

export interface FixPatch {
  issueKey: string;
  filePath: string;
  original: string;
  replacement: string;
  description: string;
  fixable: boolean;
  reason?: string;
}

export interface FixResult {
  patches: FixPatch[];
  unfixable: { issueKey: string; reason: string }[];
  summary: string;
}

// ── Verifier output ──

export interface VerifierCheck {
  name: string;
  passed: boolean;
  output: string;
}

export interface VerifierResult {
  passed: boolean;
  checks: VerifierCheck[];
  feedback: string;
}

// ── Reporter output ──

export interface ReporterResult {
  markdown: string;
}

// ── Pipeline context ──

export interface PipelineContext {
  projectKey: string;
  projectRoot: string;
  collector?: CollectorResult;
  triage?: TriageResult;
  fix?: FixResult;
  verifier?: VerifierResult;
  reporter?: ReporterResult;
}
