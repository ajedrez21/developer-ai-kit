import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { computeFingerprint, isKitOutputPath } from "./fingerprint.js";
import { captureGitSnapshot, listCommitsSince } from "./git.js";
import { KIT_VERSION, posixPath } from "./kit-root.js";
import { findChangeForWorkItem, listChangeFiles, parseTasks, readIfExists } from "./openspec.js";
import { loadPolicy } from "./policy.js";
import { exceptionValid, findSecurityReportDir } from "./security.js";
import type { GateStatus, PrReadinessStatus, WorkContext, WorkResult } from "./types.js";
import { workItemDir } from "./work-context.js";

export interface ReadinessInput {
  ctx: WorkContext;
  verification?: { status: GateStatus; checkedFingerprint: string; reportRef: string; checkedAt: string };
  security?: { status: GateStatus; checkedFingerprint: string; reportRef: string; checkedAt: string };
  openspec?: WorkResult["openspec"];
  commits?: WorkResult["commits"];
  exceptions?: WorkResult["exceptions"];
  changeId: string;
  repoId: string;
}

export function evaluatePrReady(target: string, input: ReadinessInput): { status: PrReadinessStatus; reasons: string[]; result: WorkResult } {
  const reasons: string[] = [];
  const policy = loadPolicy(target);
  const snap = captureGitSnapshot(target);
  const fp = computeFingerprint(target, { scopePaths: input.ctx.scope.included });
  if (input.ctx.readiness.status !== "READY") reasons.push(`Contexto no READY (${input.ctx.readiness.status})`);
  if (!input.verification || !["PASS", "REVIEW"].includes(input.verification.status)) {
    reasons.push(`Verify no aceptado (${input.verification?.status ?? "NOT_RUN"})`);
  }
  if (input.verification && input.verification.checkedFingerprint !== fp.codeFingerprint) {
    reasons.push("Verify STALE: fingerprint distinto al actual");
  }
  if (!input.security || input.security.status === "FAIL" || input.security.status === "NOT_AVAILABLE") {
    reasons.push(`Seguridad bloquea (${input.security?.status ?? "NOT_RUN"})`);
  }
  if (input.security && input.security.checkedFingerprint !== fp.codeFingerprint) {
    reasons.push("Security STALE: fingerprint distinto al actual");
  }
  const expired = (input.exceptions ?? []).filter((item) => !exceptionValid(item));
  if (expired.length) reasons.push(`Excepciones inválidas/vencidas: ${expired.map((item) => item.id).join(", ")}`);
  if (!new RegExp(policy.branchPattern).test(snap.branch)) {
    reasons.push(`Rama ${snap.branch} no cumple ${policy.branchPattern}`);
  }
  const refOk = (input.commits ?? []).some((commit) => commit.workItemIds.includes(String(input.ctx.workItem.id)) || commit.message.includes(`#${input.ctx.workItem.id}`) || commit.message.includes(`AB#${input.ctx.workItem.id}`));
  if (!refOk) reasons.push("Ningún commit referencia el Work Item con la sintaxis configurada");
  const dirtyCode = [...snap.staged, ...snap.unstaged, ...snap.untracked].filter((file) => !isKitOutputPath(file));
  if (dirtyCode.length) reasons.push(`Working tree con código sin evaluar: ${dirtyCode.join(", ")}`);
  if (input.openspec && input.openspec.completedTasks < input.openspec.totalTasks) {
    reasons.push(`OpenSpec incompleto ${input.openspec.completedTasks}/${input.openspec.totalTasks}`);
  }
  const status: PrReadinessStatus = reasons.length ? "BLOCKED" : "READY";
  const result: WorkResult = {
    schemaVersion: "team-ai/v1",
    artifactType: "work-result",
    artifactId: `res-${input.ctx.workItem.organization}-${input.ctx.workItem.project}-${input.ctx.workItem.id}-${input.repoId}`,
    generatedAt: new Date().toISOString(),
    workItem: input.ctx.workItem,
    contextVersion: input.ctx.contextVersion,
    contextHash: input.ctx.contextHash,
    kitVersion: KIT_VERSION,
    repository: {
      repoId: input.repoId,
      branch: snap.branch,
      headSha: snap.headSha,
      baseSha: snap.baseSha,
    },
    changeId: input.changeId,
    codeFingerprint: fp.codeFingerprint,
    verification: input.verification ?? { status: "NOT_RUN", reportRef: "", checkedFingerprint: "", checkedAt: "" },
    security: input.security ?? { status: "NOT_RUN", reportRef: "", checkedFingerprint: "", checkedAt: "" },
    openspec: input.openspec ?? { proposalRef: "", designRef: "", tasksRef: "", completedTasks: 0, totalTasks: 0 },
    commits: input.commits ?? [],
    pullRequests: [],
    exceptions: input.exceptions ?? [],
    prReadiness: { status, reasons },
  };
  return { status, reasons, result };
}

export function exportWorkResult(target: string, result: WorkResult): string {
  const dir = workItemDir(target, result.workItem.organization, result.workItem.project, result.workItem.id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `work-result-${result.repository.repoId}.json`);
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return path;
}

export function prBody(ctx: WorkContext, result: WorkResult): string {
  return `## Summary
- ${ctx.summary.functionalGoal}

## Work item
${ctx.workItem.url}

## Validation
- Verify: ${result.verification.status} (\`${result.verification.reportRef}\`)
- Security: ${result.security.status} (\`${result.security.reportRef}\`)
- Fingerprint: \`${result.codeFingerprint}\`

## Risks
${ctx.gaps.map((gap) => `- ${gap.question}`).join("\n") || "- (ninguno documentado)"}

## Acceptance
${ctx.acceptanceCriteria.map((item) => `- ${item.id}: ${item.text}`).join("\n")}
`;
}

export function gatherReadinessInput(
  target: string,
  input: { ctx: WorkContext; changeId: string; repoId: string },
): ReadinessInput {
  const policy = loadPolicy(target);
  const dir = workItemDir(target, input.ctx.workItem.organization, input.ctx.workItem.project, input.ctx.workItem.id);
  return {
    ctx: input.ctx,
    changeId: input.changeId,
    repoId: input.repoId,
    verification: loadVerificationGate(target, dir),
    security: loadSecurityGate(target, input.ctx, input.repoId),
    openspec: loadOpenSpecProgress(target, input.ctx.workItem.id, input.changeId),
    commits: loadBranchCommits(target, policy.baseBranch, input.ctx.workItem.id),
    exceptions: [],
  };
}

function loadVerificationGate(
  target: string,
  dir: string,
): ReadinessInput["verification"] {
  const path = join(dir, "verify-report.json");
  if (!existsSync(path)) return undefined;
  try {
    const report = JSON.parse(readFileSync(path, "utf8")) as {
      status?: GateStatus;
      checkedFingerprint?: string;
      generatedAt?: string;
    };
    return {
      status: report.status ?? "NOT_RUN",
      checkedFingerprint: report.checkedFingerprint ?? "",
      reportRef: posixPath(relative(target, path)),
      checkedAt: report.generatedAt ?? "",
    };
  } catch {
    return { status: "NOT_AVAILABLE", checkedFingerprint: "", reportRef: posixPath(relative(target, path)), checkedAt: "" };
  }
}

function loadSecurityGate(
  target: string,
  ctx: WorkContext,
  repoId: string,
): ReadinessInput["security"] {
  const dir = findSecurityReportDir(
    target,
    ctx.workItem.organization,
    ctx.workItem.project,
    ctx.workItem.id,
    repoId,
  );
  if (!dir) return undefined;
  const latestPath = join(dir, "latest.json");
  if (!existsSync(latestPath)) return undefined;
  try {
    const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { json?: string; result?: GateStatus };
    const reportPath = latest.json ? join(dir, latest.json) : "";
    const report = reportPath && existsSync(reportPath)
      ? (JSON.parse(readFileSync(reportPath, "utf8")) as { result?: GateStatus; checkedFingerprint?: string; generatedAt?: string })
      : null;
    return {
      status: report?.result ?? latest.result ?? "NOT_RUN",
      checkedFingerprint: report?.checkedFingerprint ?? "",
      reportRef: posixPath(relative(target, reportPath || latestPath)),
      checkedAt: report?.generatedAt ?? "",
    };
  } catch {
    return { status: "NOT_AVAILABLE", checkedFingerprint: "", reportRef: posixPath(relative(target, latestPath)), checkedAt: "" };
  }
}

function loadOpenSpecProgress(
  target: string,
  workItemId: number,
  changeId: string,
): WorkResult["openspec"] | undefined {
  const dir = findChangeForWorkItem(target, workItemId, changeId);
  if (!dir) return undefined;
  const id = basename(dir);
  const files = listChangeFiles(target, id);
  const tasks = parseTasks(readIfExists(files?.tasks ?? join(dir, "tasks.md")));
  return {
    proposalRef: posixPath(relative(target, files?.proposal ?? join(dir, "proposal.md"))),
    designRef: posixPath(relative(target, files?.design ?? join(dir, "design.md"))),
    tasksRef: posixPath(relative(target, files?.tasks ?? join(dir, "tasks.md"))),
    completedTasks: tasks.completed,
    totalTasks: tasks.total,
  };
}

function loadBranchCommits(
  target: string,
  baseRef: string,
  workItemId: number,
): WorkResult["commits"] {
  return listCommitsSince(target, baseRef).map((commit) => ({
    sha: commit.sha,
    message: commit.message,
    workItemIds: workItemIdsFromMessage(commit.message, workItemId),
  }));
}

export function workItemIdsFromMessage(message: string, fallbackId?: number): string[] {
  const ids = new Set<string>();
  for (const match of message.matchAll(/\b(?:AB)?#(\d+)\b/gi)) ids.add(match[1]);
  if (fallbackId && (message.includes(`#${fallbackId}`) || message.includes(`AB#${fallbackId}`))) {
    ids.add(String(fallbackId));
  }
  return [...ids];
}

export function detectRepoId(target: string): string {
  const pkg = join(target, "package.json");
  if (existsSync(pkg)) {
    try {
      const name = (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name;
      if (name) return name.replace(/^@.*\//, "");
    } catch {
      // ignore
    }
  }
  return "repo";
}
