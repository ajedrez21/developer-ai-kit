import { hashExcluding } from "./canonical.js";
import type {
  ContractStatus,
  DependencyStatus,
  EvidenceClassification,
  GateStatus,
  PrReadinessStatus,
  ReadinessStatus,
  WorkContext,
  WorkResult,
} from "./types.js";

const CONTRACT_STATUSES: ContractStatus[] = ["UNKNOWN", "PROPOSED", "CONFIRMED", "NOT_APPLICABLE"];
const DEP_STATUSES: DependencyStatus[] = ["UNKNOWN", "PENDING", "SATISFIED", "NOT_APPLICABLE"];
const EVIDENCE: EvidenceClassification[] = ["CONFIRMED", "INFERRED", "UNKNOWN"];
const READY: ReadinessStatus[] = ["DRAFT", "BLOCKED", "READY"];
const GATES: GateStatus[] = ["PASS", "FAIL", "REVIEW", "NOT_RUN", "NOT_AVAILABLE", "STALE"];
const PR: PrReadinessStatus[] = ["READY", "BLOCKED", "UNKNOWN"];

export interface ValidationIssue {
  path: string;
  message: string;
}

export function validateWorkContext(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) return [{ path: "", message: "debe ser un objeto" }];
  const ctx = value as Record<string, unknown>;
  expect(ctx, "schemaVersion", "team-ai/v1", issues);
  expect(ctx, "artifactType", "work-context", issues);
  requireString(ctx, "artifactId", issues);
  requireString(ctx, "generatedAt", issues);
  requireNumber(ctx, "contextVersion", issues);
  requireString(ctx, "contextHash", issues);
  validateWorkItem(ctx.workItem, "workItem", issues);
  if (ctx.parentWorkItem !== null) validateWorkItem(ctx.parentWorkItem, "parentWorkItem", issues);
  if (!Array.isArray(ctx.repositories)) issues.push({ path: "repositories", message: "debe ser lista" });
  else {
    const roles = new Set<string>();
    for (const [i, repo] of ctx.repositories.entries()) {
      if (!isObject(repo)) continue;
      const rec = repo as Record<string, unknown>;
      requireString(rec, "repoId", issues, `repositories[${i}]`);
      if (!["frontend", "backend", "shared"].includes(String(rec.role))) {
        issues.push({ path: `repositories[${i}].role`, message: "rol inválido" });
      }
      roles.add(String(rec.repoId));
    }
  }
  validateUniqueIds(ctx.contracts, "contracts", issues);
  validateUniqueIds(ctx.dependencies, "dependencies", issues);
  validateUniqueIds(ctx.evidence, "evidence", issues);
  validateUniqueIds(ctx.acceptanceCriteria, "acceptanceCriteria", issues);
  if (Array.isArray(ctx.contracts)) {
    for (const [i, item] of ctx.contracts.entries()) {
      if (isObject(item) && !CONTRACT_STATUSES.includes((item as { status: ContractStatus }).status)) {
        issues.push({ path: `contracts[${i}].status`, message: "status inválido" });
      }
    }
  }
  if (Array.isArray(ctx.dependencies)) {
    for (const [i, item] of ctx.dependencies.entries()) {
      if (isObject(item) && !DEP_STATUSES.includes((item as { status: DependencyStatus }).status)) {
        issues.push({ path: `dependencies[${i}].status`, message: "status inválido" });
      }
    }
  }
  if (Array.isArray(ctx.evidence)) {
    for (const [i, item] of ctx.evidence.entries()) {
      if (isObject(item) && !EVIDENCE.includes((item as { classification: EvidenceClassification }).classification)) {
        issues.push({ path: `evidence[${i}].classification`, message: "classification inválida" });
      }
    }
  }
  if (isObject(ctx.readiness) && !READY.includes((ctx.readiness as { status: ReadinessStatus }).status)) {
    issues.push({ path: "readiness.status", message: "status inválido" });
  }
  return issues;
}

export function validateWorkResult(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(value)) return [{ path: "", message: "debe ser un objeto" }];
  const res = value as Record<string, unknown>;
  expect(res, "schemaVersion", "team-ai/v1", issues);
  expect(res, "artifactType", "work-result", issues);
  requireString(res, "artifactId", issues);
  requireString(res, "kitVersion", issues);
  requireString(res, "codeFingerprint", issues);
  validateWorkItem(res.workItem, "workItem", issues);
  validateGate(res.verification, "verification", issues);
  validateGate(res.security, "security", issues);
  if (isObject(res.prReadiness) && !PR.includes((res.prReadiness as { status: PrReadinessStatus }).status)) {
    issues.push({ path: "prReadiness.status", message: "status inválido" });
  }
  return issues;
}

export function attachContextHash(ctx: Omit<WorkContext, "contextHash"> | WorkContext): WorkContext {
  const copy = { ...ctx } as Record<string, unknown>;
  delete copy.contextHash;
  const contextHash = hashExcluding(copy, ["contextHash"]);
  return { ...(ctx as Omit<WorkContext, "contextHash">), contextHash };
}

export function assertValidContext(ctx: WorkContext): void {
  const issues = validateWorkContext(ctx);
  if (issues.length) {
    throw new Error(`work-context inválido: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  }
}

function validateGate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: "debe ser objeto" });
    return;
  }
  const rec = value as Record<string, unknown>;
  if (!GATES.includes(String(rec.status) as GateStatus)) {
    issues.push({ path: `${path}.status`, message: "status inválido" });
  }
  requireString(rec, "reportRef", issues, path);
  requireString(rec, "checkedFingerprint", issues, path);
}

function validateWorkItem(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ path, message: "identidad Azure inválida" });
    return;
  }
  const rec = value as Record<string, unknown>;
  requireString(rec, "organization", issues, path);
  requireString(rec, "project", issues, path);
  requireNumber(rec, "id", issues, path);
  requireNumber(rec, "revision", issues, path);
  requireString(rec, "url", issues, path);
}

function validateUniqueIds(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "debe ser lista" });
    return;
  }
  const seen = new Set<string>();
  for (const [i, item] of value.entries()) {
    if (!isObject(item) || typeof (item as { id?: unknown }).id !== "string") {
      issues.push({ path: `${path}[${i}].id`, message: "id requerido" });
      continue;
    }
    const id = (item as { id: string }).id;
    if (seen.has(id)) issues.push({ path: `${path}[${i}].id`, message: `duplicado ${id}` });
    seen.add(id);
  }
}

function expect(obj: Record<string, unknown>, key: string, expected: string, issues: ValidationIssue[]): void {
  if (obj[key] !== expected) issues.push({ path: key, message: `debe ser ${expected}` });
}

function requireString(obj: Record<string, unknown>, key: string, issues: ValidationIssue[], prefix = ""): void {
  const path = prefix ? `${prefix}.${key}` : key;
  if (typeof obj[key] !== "string" || obj[key] === "") issues.push({ path, message: "string requerido" });
}

function requireNumber(obj: Record<string, unknown>, key: string, issues: ValidationIssue[], prefix = ""): void {
  const path = prefix ? `${prefix}.${key}` : key;
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) issues.push({ path, message: "número requerido" });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sampleWorkContext(overrides: Partial<WorkContext> = {}): WorkContext {
  const base = attachContextHash({
    schemaVersion: "team-ai/v1",
    artifactType: "work-context",
    artifactId: "ctx-fixture-3215",
    generatedAt: "2026-10-03T12:00:00Z",
    workItem: {
      organization: "contoso",
      project: "shop",
      id: 3215,
      revision: 7,
      url: "https://dev.azure.com/contoso/shop/_workitems/edit/3215",
    },
    parentWorkItem: {
      organization: "contoso",
      project: "shop",
      id: 3200,
      revision: 3,
      url: "https://dev.azure.com/contoso/shop/_workitems/edit/3200",
    },
    contextVersion: 1,
    repositories: [
      { repoId: "shop-api", role: "backend", baseRef: "main", baseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    ],
    summary: {
      functionalGoal: "Filtrar clientes por estado",
      currentBehavior: "La búsqueda no acepta statusId",
      expectedBehavior: "La búsqueda filtra por statusId si se envía",
    },
    scope: {
      included: ["src/customers"],
      excluded: ["src/payments"],
      candidateFiles: ["src/customers/search.ts", "src/customers/search.test.ts"],
    },
    acceptanceCriteria: [{ id: "AC1", text: "Filtra por statusId cuando se envía", evidenceIds: ["E1"] }],
    contracts: [
      {
        id: "SP-CUSTOMER-SEARCH",
        kind: "stored-procedure",
        version: "1.2.0",
        status: "CONFIRMED",
        sourceEvidenceIds: ["E1"],
        definition: { name: "usp_Customer_Search", params: [{ name: "statusId", type: "int", nullable: true }] },
      },
    ],
    dependencies: [
      { id: "DEP-SP-ENV", kind: "sp-availability", status: "SATISFIED", blocks: [], evidenceIds: ["E2"] },
    ],
    evidence: [
      {
        id: "E1",
        kind: "azure-comment",
        source: "work-item:3215",
        classification: "CONFIRMED",
        observedAt: "2026-10-03T12:00:00Z",
        summary: "Contrato SP adjunto y confirmado",
      },
      {
        id: "E2",
        kind: "environment",
        source: "dev-db",
        classification: "INFERRED",
        observedAt: "2026-10-03T12:00:00Z",
        summary: "SP presente en inventario de desarrollo",
      },
    ],
    gaps: [],
    testPlan: [{ id: "T1", description: "búsqueda con y sin statusId", command: "npm test -- search" }],
    assignedTo: "dev.backend.1",
    readiness: { status: "READY", reasons: [] },
  });
  return { ...base, ...overrides };
}

export function sampleWorkResult(overrides: Partial<WorkResult> = {}): WorkResult {
  return {
    schemaVersion: "team-ai/v1",
    artifactType: "work-result",
    artifactId: "res-fixture-3215-shop-api",
    generatedAt: "2026-10-03T13:00:00Z",
    workItem: sampleWorkContext().workItem,
    contextVersion: 1,
    contextHash: sampleWorkContext().contextHash,
    kitVersion: "1.0.0",
    repository: {
      repoId: "shop-api",
      branch: "feature/3215-customer-status-filter",
      headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      baseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    changeId: "wi-3215-customer-status-filter",
    codeFingerprint: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    verification: {
      status: "PASS",
      reportRef: ".ai/work-items/contoso-shop-3215/verify-report.json",
      checkedFingerprint: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      checkedAt: "2026-10-03T12:50:00Z",
    },
    security: {
      status: "PASS",
      reportRef: ".ai/security/contoso-shop-3215/shop-api/review-001.json",
      checkedFingerprint: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      checkedAt: "2026-10-03T12:55:00Z",
    },
    openspec: {
      proposalRef: "openspec/changes/wi-3215-customer-status-filter/proposal.md",
      designRef: "openspec/changes/wi-3215-customer-status-filter/design.md",
      tasksRef: "openspec/changes/wi-3215-customer-status-filter/tasks.md",
      completedTasks: 4,
      totalTasks: 4,
    },
    commits: [{ sha: "dddddddddddddddddddddddddddddddddddddddd", message: "feat(customers): add status filter #3215", workItemIds: ["3215"] }],
    pullRequests: [],
    exceptions: [],
    prReadiness: { status: "READY", reasons: [] },
    ...overrides,
  };
}
