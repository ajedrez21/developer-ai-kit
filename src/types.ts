export type Role = "frontend" | "backend" | "shared";
export type Host = "claude" | "cursor";
export type ReadinessStatus = "DRAFT" | "BLOCKED" | "READY";
export type ContractStatus = "UNKNOWN" | "PROPOSED" | "CONFIRMED" | "NOT_APPLICABLE";
export type DependencyStatus = "UNKNOWN" | "PENDING" | "SATISFIED" | "NOT_APPLICABLE";
export type EvidenceClassification = "CONFIRMED" | "INFERRED" | "UNKNOWN";
export type GateStatus = "PASS" | "FAIL" | "REVIEW" | "NOT_RUN" | "NOT_AVAILABLE" | "STALE";
export type PrReadinessStatus = "READY" | "BLOCKED" | "UNKNOWN";
export type FindingOrigin = "INTRODUCED" | "PRE_EXISTING" | "UNKNOWN";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface WorkItemIdentity {
  organization: string;
  project: string;
  id: number;
  revision: number;
  url: string;
}

export interface RepositoryRef {
  repoId: string;
  role: Role;
  baseRef: string;
  baseSha: string;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  evidenceIds: string[];
}

export interface ContractDef {
  id: string;
  kind: string;
  version: string;
  status: ContractStatus;
  sourceEvidenceIds: string[];
  definition: unknown;
}

export interface DependencyDef {
  id: string;
  kind: string;
  status: DependencyStatus;
  blocks: string[];
  evidenceIds: string[];
}

export interface EvidenceItem {
  id: string;
  kind: string;
  source: string;
  classification: EvidenceClassification;
  observedAt: string;
  summary: string;
}

export interface GapItem {
  id: string;
  question: string;
  blocking: boolean;
  evidenceIds: string[];
}

export interface TestPlanItem {
  id: string;
  description: string;
  command?: string;
  expected?: string;
}

export interface WorkContext {
  schemaVersion: "team-ai/v1";
  artifactType: "work-context";
  artifactId: string;
  generatedAt: string;
  workItem: WorkItemIdentity;
  parentWorkItem: WorkItemIdentity | null;
  contextVersion: number;
  contextHash: string;
  repositories: RepositoryRef[];
  summary: {
    functionalGoal: string;
    currentBehavior: string;
    expectedBehavior: string;
  };
  scope: {
    included: string[];
    excluded: string[];
    candidateFiles: string[];
  };
  acceptanceCriteria: AcceptanceCriterion[];
  contracts: ContractDef[];
  dependencies: DependencyDef[];
  evidence: EvidenceItem[];
  gaps: GapItem[];
  testPlan: TestPlanItem[];
  assignedTo: string | null;
  readiness: {
    status: ReadinessStatus;
    reasons: string[];
  };
}

export interface WorkResult {
  schemaVersion: "team-ai/v1";
  artifactType: "work-result";
  artifactId: string;
  generatedAt: string;
  workItem: WorkItemIdentity;
  contextVersion: number;
  contextHash: string;
  kitVersion: string;
  repository: {
    repoId: string;
    branch: string;
    headSha: string;
    baseSha: string;
  };
  changeId: string;
  codeFingerprint: string;
  verification: {
    status: GateStatus;
    reportRef: string;
    checkedFingerprint: string;
    checkedAt: string;
  };
  security: {
    status: GateStatus;
    reportRef: string;
    checkedFingerprint: string;
    checkedAt: string;
  };
  openspec: {
    proposalRef: string;
    designRef: string;
    tasksRef: string;
    completedTasks: number;
    totalTasks: number;
  };
  commits: Array<{ sha: string; message: string; workItemIds: string[] }>;
  pullRequests: Array<{ id: string; url: string; status: string }>;
  exceptions: Array<{
    id: string;
    reason: string;
    approvedBy: string;
    expiresAt: string;
    evidenceRef: string;
    findingIds?: string[];
  }>;
  prReadiness: {
    status: PrReadinessStatus;
    reasons: string[];
  };
}

export interface GitSnapshot {
  branch: string;
  headSha: string;
  baseSha: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  deleted: string[];
  initialStatus: string;
}

export interface FingerprintResult {
  algorithm: "team-ai-fingerprint/v1";
  codeFingerprint: string;
  files: Array<{ path: string; status: "present" | "deleted"; sha256?: string }>;
  outOfScope: string[];
  excluded: string[];
  identity: {
    branch: string;
    headSha: string;
    baseSha: string;
  };
}

export interface ManagedFile {
  path: string;
  hash: string;
  kind: "generated" | "merged-block" | "template";
}

export interface KitManifest {
  kitVersion: string;
  installedAt: string;
  updatedAt: string;
  source: {
    corePath: string;
    coreVersion: string;
  };
  hosts: Host[];
  role: Role;
  supportedVersions: Record<string, string>;
  installedVersions: Record<string, string>;
  managedFiles: ManagedFile[];
  userCustomizations: string[];
  securitySkill: {
    name: string;
    path: string | null;
    version: string | null;
    status: "configured" | "not_configured" | "not_found";
  };
  azure: {
    organization: string | null;
    project: string | null;
    mcpProfile: "developer-read" | "unrestricted-limitation";
  };
}
