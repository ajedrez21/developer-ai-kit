import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { captureGitSnapshot, runGit } from "./git.js";
import { loadPolicy, workItemRef } from "./policy.js";
import type { WorkContext } from "./types.js";

export interface CommitPreview {
  allowed: boolean;
  files: string[];
  blockedReasons: string[];
  message: string;
}

export function previewCommit(options: {
  target: string;
  ctx: WorkContext;
  ownedFiles: string[];
  messageSummary: string;
  bullets: string[];
}): CommitPreview {
  const snapshot = captureGitSnapshot(options.target);
  const policy = loadPolicy(options.target);
  const blocked: string[] = [];
  const owned = new Set(options.ownedFiles.map((file) => file.replaceAll("\\", "/")));
  const stagedForeign = snapshot.staged.filter((file) => !owned.has(file) && !file.startsWith(".ai/"));
  const mixed = [...snapshot.unstaged, ...snapshot.untracked].filter((file) => !owned.has(file) && !file.startsWith(".ai/"));
  if (stagedForeign.length) blocked.push(`Staging ajeno: ${stagedForeign.join(", ")}. No se hará git add .`);
  if (mixed.length && snapshot.staged.some((file) => owned.has(file))) {
    blocked.push("Hay cambios mezclados con trabajo del usuario; separar antes de commitear.");
  }
  const files = snapshot.staged.filter((file) => owned.has(file) || file.startsWith("openspec/"));
  if (!files.length && options.ownedFiles.length) {
    const unstagedOwned = [...snapshot.unstaged, ...snapshot.untracked].filter((file) => owned.has(file));
    files.push(...unstagedOwned);
  }
  const ref = workItemRef(options.ctx.workItem.id, policy.workItemRefSyntax);
  const summary = stripWorkItemRef(options.messageSummary, options.ctx.workItem.id);
  const message = [
    `${summary} ${ref}`.trim(),
    "",
    ...options.bullets.filter(Boolean).map((line) => `- ${line.replace(/^-\s*/, "")}`),
  ].join("\n");
  if (looksLikeSecret(message)) blocked.push("El mensaje parece contener un secreto.");
  return { allowed: blocked.length === 0 && files.length > 0, files, blockedReasons: blocked, message };
}

export function commitChange(options: {
  target: string;
  preview: CommitPreview;
  confirm: boolean;
}): { sha: string | null; preview: CommitPreview } {
  if (!options.confirm) return { sha: null, preview: options.preview };
  if (!options.preview.allowed) throw new Error(options.preview.blockedReasons.join("\n"));
  for (const file of options.preview.files) {
    const add = runGit(options.target, ["add", "--", file]);
    if (add.code !== 0) throw new Error(add.stderr);
  }
  const commit = spawnSync("git", ["commit", "-m", options.preview.message], {
    cwd: options.target,
    encoding: "utf8",
    windowsHide: true,
  });
  if (commit.status !== 0) throw new Error(commit.stderr || "git commit falló");
  const sha = runGit(options.target, ["rev-parse", "HEAD"]).stdout.trim();
  return { sha, preview: options.preview };
}

export function looksLikeSecret(text: string): boolean {
  return /api[_-]?key\s*=\s*\S+|secret\s*=\s*\S+|Bearer\s+[A-Za-z0-9\-._]+/i.test(text);
}

export function secretsInDiff(diff: string): string[] {
  const hits: string[] = [];
  if (/-----BEGIN (RSA |OPENSSH |PRIVATE )KEY-----/.test(diff)) hits.push("private-key");
  if (/(ghp|github_pat)_[A-Za-z0-9_]{20,}/.test(diff)) hits.push("github-token");
  if (/AKIA[0-9A-Z]{16}/.test(diff)) hits.push("aws-key");
  return hits;
}

export function readDiff(target: string, files: string[]): string {
  if (!files.length) return "";
  return runGit(target, ["diff", "--", ...files]).stdout;
}

export function fileListFromStatus(target: string): string[] {
  if (!existsSync(target)) return [];
  return captureGitSnapshot(target).staged;
}

export function inferCommitSummary(ctx: WorkContext, files: string[]): string {
  const goal = stripWorkItemRef(ctx.summary.functionalGoal, ctx.workItem.id).trim() || `work item ${ctx.workItem.id}`;
  const text = goal.charAt(0).toLowerCase() + goal.slice(1);
  const area = areaFromFiles(files);
  return area ? `feat(${area}): ${text}` : `feat: ${text}`;
}

export function inferCommitBullets(target: string, files: string[]): string[] {
  if (!files.length) return [];
  const unstaged = runGit(target, ["diff", "--numstat", "--", ...files]).stdout;
  const staged = runGit(target, ["diff", "--cached", "--numstat", "--", ...files]).stdout;
  const bullets: string[] = [];
  const seen = new Set<string>();
  for (const line of `${unstaged}\n${staged}`.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match || seen.has(match[3])) continue;
    seen.add(match[3]);
    bullets.push(`${match[3]} (+${match[1]} -${match[2]})`);
  }
  if (bullets.length) return bullets;
  return files.map((file) => file.replaceAll("\\", "/"));
}

function areaFromFiles(files: string[]): string | null {
  for (const file of files) {
    const parts = file.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "src");
    if (parts.length) return parts[0].replace(/\.[^.]+$/, "");
  }
  return null;
}

function stripWorkItemRef(text: string, id: number): string {
  return text
    .replace(new RegExp(`\\s*(?:AB)?#${id}\\b`, "gi"), "")
    .replace(/\s*#\d+\s*$/g, "")
    .trim();
}

void basename;
void readFileSync;
