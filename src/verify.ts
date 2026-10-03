import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeFingerprint } from "./fingerprint.js";
import { captureGitSnapshot } from "./git.js";
import { loadPolicy } from "./policy.js";
import type { GateStatus, WorkContext } from "./types.js";
import { loadLocalContext, workItemDir } from "./work-context.js";

export interface CheckResult {
  id: string;
  status: GateStatus;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  summary: string;
  applicable: boolean;
  applicabilityReason?: string;
}

export interface VerifyReport {
  workItemId: number;
  status: GateStatus;
  contextHash: string;
  planHash: string | null;
  checkedFingerprint: string;
  git: { branch: string; headSha: string; baseSha: string };
  plannedFiles: string[];
  touchedFiles: string[];
  extraFiles: Array<{ path: string; reason: string }>;
  acceptance: Array<{ id: string; status: "met" | "pending" | "unknown"; evidence: string }>;
  checks: CheckResult[];
  generatedAt: string;
}

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): { code: number; stdout: string; stderr: string };
}

export const defaultRunner: CommandRunner = {
  run(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, encoding: "utf8", windowsHide: true, shell: false });
    return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  },
};

export function verifyChange(options: {
  target: string;
  organization?: string;
  project?: string;
  workItemId: number;
  context?: WorkContext;
  plannedFiles?: string[];
  runner?: CommandRunner;
}): VerifyReport {
  const ctx =
    options.context ??
    loadLocalContext(
      options.target,
      options.organization ?? "local",
      options.project ?? "local",
      options.workItemId,
    );
  if (!ctx) throw new Error("No hay work-context local. Ejecutar /work-item primero.");
  const snapshot = captureGitSnapshot(options.target);
  const fingerprint = computeFingerprint(options.target, { scopePaths: ctx.scope.included });
  const planned = options.plannedFiles ?? ctx.scope.candidateFiles;
  const touched = unique([...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked, ...snapshot.deleted]);
  const extraFiles = touched
    .filter((path) => !planned.includes(path) && !path.startsWith(".ai/") && !path.startsWith("openspec/"))
    .map((path) => ({ path, reason: "archivo tocado fuera de candidateFiles del contexto" }));
  const checks = runRepoChecks(options.target, options.runner ?? defaultRunner);
  const acceptance = ctx.acceptanceCriteria.map((criterion) => ({
    id: criterion.id,
    status: "unknown" as const,
    evidence: "Requiere revisión del agente contra la implementación; el script no marca PASS de criterios sin evidencia.",
  }));
  const checkStatus = aggregate(checks, extraFiles.length > 0);
  const report: VerifyReport = {
    workItemId: options.workItemId,
    status: checkStatus,
    contextHash: ctx.contextHash,
    planHash: null,
    checkedFingerprint: fingerprint.codeFingerprint,
    git: fingerprint.identity,
    plannedFiles: planned,
    touchedFiles: touched,
    extraFiles,
    acceptance,
    checks,
    generatedAt: new Date().toISOString(),
  };
  const dir = workItemDir(options.target, ctx.workItem.organization, ctx.workItem.project, ctx.workItem.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "verify-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "verify-report.md"), renderVerify(report), "utf8");
  return report;
}

export function runRepoChecks(target: string, runner: CommandRunner): CheckResult[] {
  const policy = loadPolicy(target);
  const pkgPath = join(target, "package.json");
  const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> }) : null;
  const scripts = pkg?.scripts ?? {};
  const results: CheckResult[] = [];
  const mapping: Record<string, { command: string; args: string[] }> = {
    lint: { command: "npm", args: ["run", "lint", "--if-present"] },
    test: { command: "npm", args: ["test", "--if-present"] },
    typecheck: { command: "npm", args: ["run", "typecheck", "--if-present"] },
    build: { command: "npm", args: ["run", "build", "--if-present"] },
  };
  const roleChecks = policy.requiredChecksByRole.shared;
  for (const id of ["lint", "typecheck", "test", "build"]) {
    const defined = Boolean(scripts[id] || (id === "test" && scripts.test));
    if (!defined) {
      results.push({
        id,
        status: roleChecks.includes(id) ? "NOT_AVAILABLE" : "NOT_RUN",
        applicable: roleChecks.includes(id),
        applicabilityReason: defined ? undefined : `script ${id} ausente en package.json`,
        summary: `Check ${id} no ejecutado: herramienta/script ausente. Nunca es PASS.`,
      });
      continue;
    }
    const spec = mapping[id];
    const started = Date.now();
    const ran = runner.run(spec.command, spec.args, target);
    results.push({
      id,
      status: ran.code === 0 ? "PASS" : "FAIL",
      command: `${spec.command} ${spec.args.join(" ")}`,
      exitCode: ran.code,
      durationMs: Date.now() - started,
      applicable: true,
      summary: (ran.stdout || ran.stderr).trim().slice(0, 400) || `exit ${ran.code}`,
    });
  }
  return results;
}

function aggregate(checks: CheckResult[], hasExtra: boolean): GateStatus {
  if (checks.some((check) => check.status === "FAIL")) return "FAIL";
  if (checks.some((check) => check.applicable && check.status === "NOT_AVAILABLE")) return "NOT_AVAILABLE";
  if (hasExtra) return "REVIEW";
  if (checks.some((check) => check.status === "NOT_RUN")) return "REVIEW";
  if (checks.filter((check) => check.applicable).every((check) => check.status === "PASS")) return "PASS";
  return "REVIEW";
}

function renderVerify(report: VerifyReport): string {
  return `# Verify ${report.workItemId}

- Estado: **${report.status}**
- Fingerprint: \`${report.checkedFingerprint}\`
- Archivos previstos: ${report.plannedFiles.length}
- Archivos tocados: ${report.touchedFiles.length}
${report.extraFiles.map((file) => `- Extra: ${file.path} (${file.reason})`).join("\n")}

## Checks
${report.checks.map((check) => `- ${check.id}: ${check.status} ${check.command ?? ""}`).join("\n")}
`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
