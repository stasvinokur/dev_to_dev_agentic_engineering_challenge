// ── Quality Gate ──

export type QualityGateStatus = "OK" | "ERROR" | "NONE";
export type CaycStatus = "compliant" | "non-compliant" | "over-compliant";

export interface QualityGateCondition {
  status: QualityGateStatus;
  metricKey: string;
  comparator: "GT" | "LT" | "EQ" | "NE";
  errorThreshold: string;
  actualValue: string;
}

export interface QualityGateProjectStatus {
  status: QualityGateStatus;
  conditions: QualityGateCondition[];
  ignoredConditions: boolean;
  caycStatus: CaycStatus;
}

export interface QualityGateResponse {
  projectStatus: QualityGateProjectStatus;
}

// ── Paging ──

export interface Paging {
  pageIndex: number;
  pageSize: number;
  total: number;
}

// ── Issues ──

/** @deprecated Use ImpactSeverity instead */
export type IssueSeverity =
  | "BLOCKER"
  | "CRITICAL"
  | "MAJOR"
  | "MINOR"
  | "INFO";

/** @deprecated Use SoftwareQuality instead */
export type IssueType =
  | "CODE_SMELL"
  | "BUG"
  | "VULNERABILITY"
  | "SECURITY_HOTSPOT";

export type ImpactSeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type SoftwareQuality =
  | "MAINTAINABILITY"
  | "RELIABILITY"
  | "SECURITY";

export type CleanCodeAttribute =
  | "CLEAR"
  | "COMPLETE"
  | "CONVENTIONAL"
  | "DISTINCT"
  | "EFFICIENT"
  | "FOCUSED"
  | "FORMATTED"
  | "IDENTIFIABLE"
  | "LAWFUL"
  | "LOGICAL"
  | "MODULAR"
  | "RESPECTFUL"
  | "TESTED"
  | "TRUSTWORTHY";

export type CleanCodeAttributeCategory =
  | "ADAPTABLE"
  | "CONSISTENT"
  | "INTENTIONAL"
  | "RESPONSIBLE";

export interface Impact {
  softwareQuality: SoftwareQuality;
  severity: ImpactSeverity;
}

export interface IssueTextRange {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface IssueFlow {
  locations: IssueLocation[];
}

export interface IssueLocation {
  component: string;
  textRange?: IssueTextRange;
  msg?: string;
}

export interface Issue {
  key: string;
  rule: string;
  component: string;
  project: string;
  line?: number;
  textRange?: IssueTextRange;
  flows: IssueFlow[];
  status: string;
  message: string;
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;

  // New Clean Code taxonomy
  cleanCodeAttribute?: CleanCodeAttribute;
  cleanCodeAttributeCategory?: CleanCodeAttributeCategory;
  impacts: Impact[];

  /** @deprecated Use impacts instead */
  severity?: IssueSeverity;
  /** @deprecated Use cleanCodeAttribute instead */
  type?: IssueType;
}

export interface IssueComponent {
  key: string;
  enabled: boolean;
  qualifier: string;
  name: string;
  longName: string;
  path?: string;
}

export interface IssueFacetValue {
  val: string;
  count: number;
}

export interface IssueFacet {
  property: string;
  values: IssueFacetValue[];
}

export interface IssuesSearchResponse {
  total: number;
  p: number;
  ps: number;
  paging: Paging;
  effortTotal: number;
  issues: Issue[];
  components: IssueComponent[];
  facets: IssueFacet[];
}

// ── Rules ──

export interface RuleParam {
  key: string;
  defaultValue?: string;
  type: string;
}

export interface RuleDescriptionSection {
  key: string;
  content: string;
  context?: {
    displayName: string;
    key: string;
  };
}

export interface Rule {
  key: string;
  repo: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  isTemplate: boolean;
  tags: string[];
  sysTags: string[];
  lang?: string;
  langName?: string;
  params: RuleParam[];
  scope: string;
  isExternal: boolean;
  descriptionSections: RuleDescriptionSection[];
  educationPrinciples: string[];

  // New Clean Code taxonomy
  cleanCodeAttribute?: CleanCodeAttribute;
  cleanCodeAttributeCategory?: CleanCodeAttributeCategory;
  impacts: Impact[];

  /** @deprecated Use impacts instead */
  severity?: IssueSeverity;
  /** @deprecated Use cleanCodeAttribute instead */
  type?: IssueType;

  // Remediation
  defaultRemFnType?: string;
  defaultRemFnBaseEffort?: string;
  remFnType?: string;
  remFnBaseEffort?: string;
  remFnOverloaded?: boolean;
}

export interface RulesSearchResponse {
  total: number;
  p: number;
  ps: number;
  paging: Paging;
  rules: Rule[];
}
