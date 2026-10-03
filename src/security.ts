import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureGitSnapshot } from "./git.js";
import { sha256Prefixed } from "./hash.js";
import { loadManifest, loadPolicy } from "./policy.js";
import type { FindingOrigin, GateStatus, Severity } from "./types.js";

export interface NormalizedFinding {
  id: string;
  title: string;
  severity: Severity;
  origin: FindingOrigin;
  file: string | null;
  symbol: string | null;
  evidence: string;
  impact: string;
  recommendation: string;
  references: string[];
  status: "open" | "accepted-exception" | "false-positive-pending";
}

export interface NormalizedSecurityReport {
  schemaVersion: "team-ai/v1";
  artifactType: "security-report";
  reviewId: string;
  workItemId: number;
  repoId: string;
  generatedAt: string;
  mode: "changes" | "full" | "commit-range";
  scope: { base: string; head: string; files: string[] };
  contextHash: string;
  checkedFingerprint: string;
  skill: { name: string; version: string | null; path: string | null };
  tools: string[];
  coverage: string;
  result: GateStatus;
  policy: string;
  findings: NormalizedFinding[];
  blocking: string[];
  limitations: string[];
  originalRef: string;
  originalSha256: string;
  treeUnchanged: boolean;
}

export function securityReview(options: {
  target: string;
  workItemId: number;
  repoId: string;
  mode: "changes" | "full";
  contextHash: string;
  fingerprint: string;
  base?: string;
}): NormalizedSecurityReport {
  const before = captureGitSnapshot(options.target).initialStatus;
  const manifest = loadManifest(options.target);
  const skillPath = manifest?.securitySkill.path ?? null;
  const skillVersion = manifest?.securitySkill.version ?? null;
  const original = invokeSecuritySkill(options.target, skillPath, options.mode, options.base);
  const after = captureGitSnapshot(options.target).initialStatus;
  const treeUnchanged = before === after;
  const parsed = normalizeSecurityOutput(original, {
    workItemId: options.workItemId,
    repoId: options.repoId,
    mode: options.mode,
    contextHash: options.contextHash,
    fingerprint: options.fingerprint,
    skillPath,
    skillVersion,
    treeUnchanged,
    base: options.base ?? "HEAD",
  });
  if (!treeUnchanged) {
    parsed.result = "FAIL";
    parsed.limitations.push("VIOLACIÓN: la fase review modificó el working tree. Readiness bloqueada.");
  }
  persistReports(options.target, parsed);
  return parsed;
}

export function invokeSecuritySkill(
  target: string,
  skillPath: string | null,
  mode: "changes" | "full",
  base?: string,
): { kind: "json" | "markdown" | "missing"; raw: string; path: string | null } {
  if (!skillPath || !existsSync(join(skillPath, "scripts", "sc.py"))) {
    return { kind: "missing", raw: "", path: null };
  }
  const command = mode === "full" ? "audit" : "diff";
  const args = [join(skillPath, "scripts", "sc.py"), command, "--project", target, "--json"];
  if (base) args.push("--base", base);
  const py = firstPython();
  if (!py) return { kind: "missing", raw: "python no disponible", path: null };
  const result = spawnSync(py, args, { encoding: "utf8", windowsHide: true });
  const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 && !raw.trim()) {
    return { kind: "missing", raw: result.stderr || "security skill falló", path: null };
  }
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    return { kind: "json", raw: raw.slice(jsonStart), path: skillPath };
  }
  return { kind: "markdown", raw, path: skillPath };
}

export function normalizeSecurityOutput(
  original: { kind: "json" | "markdown" | "missing"; raw: string; path: string | null },
  meta: {
    workItemId: number;
    repoId: string;
    mode: "changes" | "full";
    contextHash: string;
    fingerprint: string;
    skillPath: string | null;
    skillVersion: string | null;
    treeUnchanged: boolean;
    base: string;
  },
): NormalizedSecurityReport {
  const reviewId = `review-${new Date().toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}`;
  const base: NormalizedSecurityReport = {
    schemaVersion: "team-ai/v1",
    artifactType: "security-report",
    reviewId,
    workItemId: meta.workItemId,
    repoId: meta.repoId,
    generatedAt: new Date().toISOString(),
    mode: meta.mode,
    scope: { base: meta.base, head: "WORKTREE", files: [] },
    contextHash: meta.contextHash,
    checkedFingerprint: meta.fingerprint,
    skill: { name: "security-compliance", version: meta.skillVersion, path: meta.skillPath },
    tools: [],
    coverage: "unknown",
    result: "NOT_AVAILABLE",
    policy: "default-critical-high-block",
    findings: [],
    blocking: [],
    limitations: [],
    originalRef: "",
    originalSha256: original.raw ? sha256Prefixed(original.raw) : "",
    treeUnchanged: meta.treeUnchanged,
  };
  if (original.kind === "missing") {
    base.limitations.push("Skill security-compliance no disponible o no produjo salida. Gate NOT_AVAILABLE, nunca PASS.");
    return base;
  }
  if (original.kind === "markdown") {
    if (!isReadableMarkdown(original.raw)) {
      base.result = "FAIL";
      base.limitations.push("Documento ilegible/incompleto: no puede dar PASS porque 'no se encontraron findings'.");
      return base;
    }
    base.result = "REVIEW";
    base.coverage = "markdown-fallback";
    base.limitations.push("Salida Markdown parseada con contrato explícito; preferir report.json nativo.");
    return base;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(original.raw) as Record<string, unknown>;
  } catch {
    base.result = "FAIL";
    base.limitations.push("JSON de la skill ilegible.");
    return base;
  }
  const required = ["findings", "gate", "snapshot", "command"];
  const missing = required.filter((key) => parsed[key] == null);
  if (missing.length) {
    base.result = "FAIL";
    base.limitations.push(`Reporte incompleto, faltan: ${missing.join(", ")}. No PASS.`);
    return base;
  }
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  base.findings = findings.map((item, index) => mapFinding(item as Record<string, unknown>, index));
  base.tools = scanners(parsed);
  base.coverage = String((parsed.snapshot as { scope?: string } | undefined)?.scope ?? "unknown");
  base.result = applyPolicy(base.findings);
  base.blocking = base.findings
    .filter((finding) => ["CRITICAL", "HIGH"].includes(finding.severity) && finding.origin === "INTRODUCED")
    .map((finding) => finding.id);
  if (base.result === "PASS" && base.findings.length === 0 && base.coverage === "unknown") {
    base.result = "REVIEW";
    base.limitations.push("PASS rechazado: cobertura desconocida y sin findings no es evidencia suficiente.");
  }
  return base;
}

function mapFinding(item: Record<string, unknown>, index: number): NormalizedFinding {
  const baseline = String(item.baseline_status ?? item.origin ?? "unknown");
  const origin: FindingOrigin =
    baseline === "introduced" || baseline === "INTRODUCED"
      ? "INTRODUCED"
      : baseline === "preexisting" || baseline === "PRE_EXISTING"
        ? "PRE_EXISTING"
        : "UNKNOWN";
  const sev = String(item.severity ?? "info").toUpperCase() as Severity;
  return {
    id: String(item.id ?? `F-${index}`),
    title: String(item.title ?? "finding"),
    severity: ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].includes(sev) ? sev : "INFO",
    origin,
    file: item.file ? String(item.file) : null,
    symbol: item.rule_id ? String(item.rule_id) : null,
    evidence: String(item.evidence ?? ""),
    impact: String(item.risk ?? ""),
    recommendation: String(item.remediation ?? ""),
    references: Array.isArray(item.mappings)
      ? (item.mappings as Array<{ framework?: string; ref?: string }>)
          .filter((m) => m.framework && m.ref)
          .map((m) => `${m.framework}:${m.ref}`)
      : [],
    status: "open",
  };
}

function applyPolicy(findings: NormalizedFinding[]): GateStatus {
  const policy = loadPolicy(".");
  const introducedBlock = findings.filter(
    (finding) => policy.blockingSeverities.includes(finding.severity) && finding.origin === "INTRODUCED",
  );
  if (introducedBlock.length) return "FAIL";
  const review = findings.filter(
    (finding) =>
      policy.reviewSeverities.includes(finding.severity) ||
      (policy.unknownOriginRequiresReview && finding.origin === "UNKNOWN" && ["CRITICAL", "HIGH", "MEDIUM"].includes(finding.severity)),
  );
  if (review.length) return "REVIEW";
  return "PASS";
}

function isReadableMarkdown(raw: string): boolean {
  const hasFindings = /finding|hallazgo|vulnerab/i.test(raw);
  const hasGate = /gate|resultado|status/i.test(raw);
  const hasScope = /scope|alcance|snapshot|archivo/i.test(raw);
  return raw.length > 80 && hasFindings && hasGate && hasScope;
}

function scanners(parsed: Record<string, unknown>): string[] {
  if (!Array.isArray(parsed.scanners)) return [];
  return parsed.scanners.map((item) => String((item as { name?: string }).name ?? item));
}

function persistReports(target: string, report: NormalizedSecurityReport): void {
  const dir = join(target, ".ai", "security", `local-local-${report.workItemId}`, report.repoId);
  mkdirSync(dir, { recursive: true });
  const seq = nextSeq(dir);
  const jsonName = `review-${seq}.json`;
  const mdName = `review-${seq}.md`;
  writeFileSync(join(dir, jsonName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, mdName), renderSecurity(report), "utf8");
  writeFileSync(
    join(dir, "latest.json"),
    `${JSON.stringify({ reviewId: report.reviewId, json: jsonName, md: mdName, result: report.result, sha256: sha256Prefixed(JSON.stringify(report)) }, null, 2)}\n`,
    "utf8",
  );
}

function nextSeq(dir: string): string {
  if (!existsSync(dir)) return "001";
  const n = readdirSync(dir).filter((name) => /^review-\d+\.json$/.test(name)).length + 1;
  return String(n).padStart(3, "0");
}

function renderSecurity(report: NormalizedSecurityReport): string {
  return `# Security ${report.reviewId}

- Resultado: **${report.result}**
- Modo: ${report.mode}
- Skill: ${report.skill.name} ${report.skill.version ?? ""}
- Fingerprint: \`${report.checkedFingerprint}\`
- Tree unchanged: ${report.treeUnchanged}

## Findings
${report.findings.map((f) => `- ${f.id} ${f.severity} ${f.origin} ${f.title}`).join("\n") || "- (ninguno)"}

## Limitaciones
${report.limitations.map((l) => `- ${l}`).join("\n") || "- (ninguna)"}
`;
}

function firstPython(): string | null {
  for (const cmd of ["python", "python3", "py"]) {
    const result = spawnSync(cmd, ["--version"], { encoding: "utf8", windowsHide: true });
    if (result.status === 0) return cmd === "py" ? "py" : cmd;
  }
  return null;
}

export function exceptionValid(exception: {
  approvedBy?: string;
  expiresAt?: string;
  reason?: string;
  evidenceRef?: string;
}): boolean {
  if (!exception.approvedBy || !exception.reason || !exception.evidenceRef || !exception.expiresAt) return false;
  return Date.parse(exception.expiresAt) > Date.now();
}
