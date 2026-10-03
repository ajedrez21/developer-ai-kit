import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { canonicalize } from "./canonical.js";
import { captureGitSnapshot, listTrackedFiles, unique } from "./git.js";
import { sha256Hex } from "./hash.js";
import { posixPath } from "./kit-root.js";
import type { FingerprintResult } from "./types.js";

export const FINGERPRINT_ALGORITHM = "team-ai-fingerprint/v1";

const DEFAULT_EXCLUDES = [
  ".ai/",
  ".ai/work-items/",
  ".ai/security/",
  ".ai/tmp/",
  ".ai/backups/",
  "node_modules/",
  "dist/",
  "coverage/",
  ".git/",
];

export interface FingerprintOptions {
  scopePaths?: string[];
  extraExcludes?: string[];
  baseRef?: string;
}

export function isKitOutputPath(relPath: string): boolean {
  const path = posixPath(relPath);
  return (
    path === ".ai" ||
    path.startsWith(".ai/") ||
    path.startsWith("node_modules/") ||
    path.startsWith("dist/") ||
    path.startsWith("coverage/") ||
    path.startsWith(".git/")
  );
}

export function computeFingerprint(repo: string, options: FingerprintOptions = {}): FingerprintResult {
  const snapshot = captureGitSnapshot(repo, options.baseRef ?? "HEAD");
  const tracked = listTrackedFiles(repo);
  const candidates = unique([
    ...tracked,
    ...snapshot.staged,
    ...snapshot.unstaged,
    ...snapshot.untracked,
    ...snapshot.deleted,
  ]);
  const excludes = [...DEFAULT_EXCLUDES, ...(options.extraExcludes ?? [])];
  const files: FingerprintResult["files"] = [];
  const excluded: string[] = [];
  const outOfScope: string[] = [];
  const scope = options.scopePaths?.map(posixPath);

  for (const rel of candidates) {
    if (shouldExclude(rel, excludes)) {
      excluded.push(rel);
      continue;
    }
    if (scope && scope.length > 0 && !inScope(rel, scope)) {
      outOfScope.push(rel);
      continue;
    }
    const abs = join(repo, rel);
    if (!existsSync(abs) || (existsSync(abs) && statSync(abs).isDirectory())) {
      files.push({ path: rel, status: "deleted" });
      continue;
    }
    const content = readFileSync(abs);
    files.push({ path: rel, status: "present", sha256: sha256Hex(content) });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const payload = {
    algorithm: FINGERPRINT_ALGORITHM,
    files,
  };
  return {
    algorithm: FINGERPRINT_ALGORITHM,
    codeFingerprint: sha256Hex(canonicalize(payload)),
    files,
    outOfScope,
    excluded,
    identity: {
      branch: snapshot.branch,
      headSha: snapshot.headSha,
      baseSha: snapshot.baseSha,
    },
  };
}

function shouldExclude(relPath: string, excludes: string[]): boolean {
  const path = posixPath(relPath);
  return excludes.some((rule) => {
    const normalized = posixPath(rule);
    if (normalized.endsWith("/")) return path === normalized.slice(0, -1) || path.startsWith(normalized);
    return path === normalized;
  });
}

function inScope(relPath: string, scope: string[]): boolean {
  return scope.some((rule) => relPath === rule || relPath.startsWith(`${rule.replace(/\/$/, "")}/`));
}

export function fingerprintsMatch(a: string, b: string): boolean {
  return a === b;
}
