import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GateStatus, KitManifest, Severity } from "./types.js";

export interface GatePolicy {
  schemaVersion: "team-ai/v1";
  blockingSeverities: Severity[];
  reviewSeverities: Severity[];
  unknownOriginRequiresReview: boolean;
  sensitivePaths: string[];
  requiredChecksByRole: Record<string, string[]>;
  workItemRefSyntax: "azure-hash" | "azure-ab";
  branchPattern: string;
}

export const DEFAULT_POLICY: GatePolicy = {
  schemaVersion: "team-ai/v1",
  blockingSeverities: ["CRITICAL", "HIGH"],
  reviewSeverities: ["MEDIUM"],
  unknownOriginRequiresReview: true,
  sensitivePaths: [
    "**/auth/**",
    "**/*authz*",
    "**/*secret*",
    "**/*payment*",
    "**/*crypto*",
    "**/*.sql",
    "**/Dockerfile*",
    "**/*pipeline*",
    "**/.env*",
  ],
  requiredChecksByRole: {
    backend: ["lint", "typecheck", "test"],
    frontend: ["lint", "typecheck", "test"],
    shared: ["lint", "test"],
  },
  workItemRefSyntax: "azure-hash",
  branchPattern: "^(feature|fix|chore)/[0-9]+[-_].+",
};

export function loadPolicy(target: string): GatePolicy {
  const path = join(target, ".ai", "gate-policy.json");
  if (!existsSync(path)) return DEFAULT_POLICY;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<GatePolicy>;
  return { ...DEFAULT_POLICY, ...parsed };
}

export function writePolicy(target: string, policy: GatePolicy): void {
  const path = join(target, ".ai", "gate-policy.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}

export function loadManifest(target: string): KitManifest | null {
  const path = join(target, ".ai", "kit-manifest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as KitManifest;
}

export function writeManifest(target: string, manifest: KitManifest): void {
  const path = join(target, ".ai", "kit-manifest.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function isFresh(status: GateStatus, reportFingerprint: string, currentFingerprint: string): GateStatus {
  if (status === "NOT_RUN" || status === "NOT_AVAILABLE") return status;
  if (!reportFingerprint || reportFingerprint !== currentFingerprint) return "STALE";
  return status;
}

export function workItemRef(id: number, syntax: GatePolicy["workItemRefSyntax"]): string {
  return syntax === "azure-ab" ? `AB#${id}` : `#${id}`;
}

export function matchesSensitivePath(relPath: string, patterns: string[]): boolean {
  const path = relPath.replaceAll("\\", "/").toLowerCase();
  return patterns.some((pattern) => globToRegExp(pattern.toLowerCase()).test(path));
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ":::DOUBLE:::")
    .replace(/\*/g, "[^/]*")
    .replace(/:::DOUBLE:::/g, ".*");
  return new RegExp(`^${escaped}$`);
}
