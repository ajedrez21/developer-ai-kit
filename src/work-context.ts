import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attachContextHash, validateWorkContext } from "./contracts.js";
import { sha256Hex } from "./hash.js";
import type { ContractStatus, WorkContext } from "./types.js";

export function workItemDir(target: string, organization: string, project: string, id: number): string {
  return join(target, ".ai", "work-items", `${organization}-${project}-${id}`);
}

export function loadLocalContext(target: string, organization: string, project: string, id: number): WorkContext | null {
  const path = join(workItemDir(target, organization, project, id), "work-context.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as WorkContext;
}

export function saveLocalContext(target: string, ctx: WorkContext): string {
  const dir = workItemDir(target, ctx.workItem.organization, ctx.workItem.project, ctx.workItem.id);
  mkdirSync(dir, { recursive: true });
  const hashed = attachContextHash({ ...ctx, contextHash: "" });
  writeFileSync(join(dir, "work-context.json"), `${JSON.stringify(hashed, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "work-context.md"), renderContextMarkdown(hashed), "utf8");
  return dir;
}

export function importTlContext(raw: unknown): { context: WorkContext; issues: string[] } {
  const issues = validateWorkContext(raw).map((issue) => `${issue.path}: ${issue.message}`);
  if (issues.length) {
    throw new Error(`Paquete TL inválido:\n${issues.join("\n")}`);
  }
  const context = attachContextHash({ ...(raw as WorkContext), contextHash: "" });
  return { context, issues: [] };
}

export function compareAzureAndPackage(
  fromAzure: Partial<WorkContext>,
  fromPackage: WorkContext,
): string[] {
  const conflicts: string[] = [];
  if (fromAzure.workItem && fromAzure.workItem.revision !== fromPackage.workItem.revision) {
    conflicts.push(
      `revision Azure=${fromAzure.workItem.revision} vs paquete=${fromPackage.workItem.revision}. Un cambio de requisitos invalida la aprobación previa.`,
    );
  }
  if (fromAzure.summary?.functionalGoal && fromAzure.summary.functionalGoal !== fromPackage.summary.functionalGoal) {
    conflicts.push("El objetivo funcional del paquete TL no coincide con Azure.");
  }
  return conflicts;
}

export function blockingContracts(ctx: WorkContext): string[] {
  return ctx.contracts
    .filter((contract) => needsConfirmedContract(contract.kind) && contract.status !== "CONFIRMED")
    .map((contract) => `Contrato ${contract.id} (${contract.kind}) status=${contract.status}; no inventar firma.`);
}

export function needsConfirmedContract(kind: string): boolean {
  return ["stored-procedure", "sp", "api-contract"].includes(kind.toLowerCase());
}

export function contractBlocksImplementation(ctx: WorkContext): boolean {
  return blockingContracts(ctx).length > 0 || ctx.gaps.some((gap) => gap.blocking) || ctx.readiness.status === "BLOCKED";
}

export function approvalPath(target: string, organization: string, project: string, id: number): string {
  return join(workItemDir(target, organization, project, id), "plan-approval.json");
}

export interface PlanApproval {
  workItemId: number;
  contextHash: string;
  planHash: string;
  changeId: string;
  repoId: string;
  baseSha: string;
  approvedAt: string;
  approvedBy: string;
}

export function saveApproval(target: string, approval: PlanApproval): void {
  writeFileSync(approvalPath(target, "local", "local", approval.workItemId), `${JSON.stringify(approval, null, 2)}\n`);
}

export function loadApproval(dir: string): PlanApproval | null {
  const path = join(dir, "plan-approval.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as PlanApproval;
}

export function approvalStillValid(approval: PlanApproval, contextHash: string, planHash: string): boolean {
  return approval.contextHash === contextHash && approval.planHash === planHash;
}

export function changeIdFor(workItemId: number, slug: string): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `wi-${workItemId}-${safe || "change"}`;
}

export function planHashFromFiles(proposal: string, design: string, tasks: string): string {
  return sha256Hex(`${proposal}\n${design}\n${tasks}`);
}

export function renderContextMarkdown(ctx: WorkContext): string {
  const gaps = ctx.gaps.map((gap) => `- ${gap.blocking ? "BLOQUEANTE" : "info"} ${gap.question}`).join("\n") || "- (ninguno)";
  const contracts = ctx.contracts
    .map((c) => `- ${c.id} ${c.kind} ${c.status}`)
    .join("\n") || "- (ninguno)";
  return `# Work Item ${ctx.workItem.id}

- Organización: ${ctx.workItem.organization}
- Proyecto: ${ctx.workItem.project}
- Revisión: ${ctx.workItem.revision}
- Readiness: **${ctx.readiness.status}**
- contextHash: \`${ctx.contextHash}\`

## Objetivo
${ctx.summary.functionalGoal}

## Aceptación
${ctx.acceptanceCriteria.map((c) => `- ${c.id}: ${c.text}`).join("\n") || "- (sin criterios)"}

## Contratos
${contracts}

## Gaps
${gaps}

## Evidencia
${ctx.evidence.map((e) => `- ${e.id} [${e.classification}] ${e.summary}`).join("\n")}
`;
}

export function azureWorkItemToContext(input: {
  organization: string;
  project: string;
  id: number;
  revision: number;
  url: string;
  title: string;
  description: string;
  acceptance: string[];
  assignedTo?: string | null;
  parent?: { id: number; revision: number; url: string } | null;
}): WorkContext {
  const criteria = input.acceptance.map((text, index) => ({
    id: `AC${index + 1}`,
    text,
    evidenceIds: ["E-AZURE"],
  }));
  const readinessStatus = criteria.length ? "DRAFT" : "BLOCKED";
  return attachContextHash({
    schemaVersion: "team-ai/v1",
    artifactType: "work-context",
    artifactId: `ctx-azure-${input.organization}-${input.project}-${input.id}`,
    generatedAt: new Date().toISOString(),
    workItem: {
      organization: input.organization,
      project: input.project,
      id: input.id,
      revision: input.revision,
      url: input.url,
    },
    parentWorkItem: input.parent
      ? {
          organization: input.organization,
          project: input.project,
          id: input.parent.id,
          revision: input.parent.revision,
          url: input.parent.url,
        }
      : null,
    contextVersion: 1,
    repositories: [],
    summary: {
      functionalGoal: input.title,
      currentBehavior: "UNKNOWN",
      expectedBehavior: input.description || "UNKNOWN",
    },
    scope: { included: [], excluded: [], candidateFiles: [] },
    acceptanceCriteria: criteria,
    contracts: [
      {
        id: "CONTRACT-UNKNOWN",
        kind: "stored-procedure",
        version: "unknown",
        status: "UNKNOWN" satisfies ContractStatus,
        sourceEvidenceIds: [],
        definition: null,
      },
    ],
    dependencies: [],
    evidence: [
      {
        id: "E-AZURE",
        kind: "azure-work-item",
        source: `work-item:${input.id}`,
        classification: "CONFIRMED",
        observedAt: new Date().toISOString(),
        summary: "Campos recuperados desde Azure DevOps",
      },
    ],
    gaps: criteria.length
      ? []
      : [{ id: "G1", question: "Faltan criterios de aceptación", blocking: true, evidenceIds: ["E-AZURE"] }],
    testPlan: [],
    assignedTo: input.assignedTo ?? null,
    readiness: {
      status: readinessStatus,
      reasons: readinessStatus === "BLOCKED" ? ["Faltan criterios de aceptación"] : ["Contexto Azure incompleto: falta paquete TL o contratos"],
    },
  });
}
