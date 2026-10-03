import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { posixPath } from "./kit-root.js";
import type { GitSnapshot } from "./types.js";

export function runGit(repo: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function requireGitRepo(repo: string): void {
  if (!existsSync(join(repo, ".git")) && runGit(repo, ["rev-parse", "--is-inside-work-tree"]).stdout.trim() !== "true") {
    throw new Error(`${repo} no es un repositorio Git.`);
  }
}

export function gitLines(repo: string, args: string[]): string[] {
  const { code, stdout, stderr } = runGit(repo, args);
  if (code !== 0) throw new Error(stderr.trim() || `git ${args.join(" ")} falló (${code})`);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(posixPath);
}

export function captureGitSnapshot(repo: string, baseRef = "HEAD"): GitSnapshot {
  requireGitRepo(repo);
  const branch = runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || "HEAD";
  const headSha = runGit(repo, ["rev-parse", "HEAD"]).stdout.trim();
  const baseResolved = runGit(repo, ["rev-parse", "--verify", baseRef]);
  const baseSha = baseResolved.code === 0 ? baseResolved.stdout.trim() : headSha;
  const staged = gitLines(repo, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  const unstaged = gitLines(repo, ["diff", "--name-only", "--diff-filter=ACMR"]);
  const deleted = [
    ...gitLines(repo, ["diff", "--cached", "--name-only", "--diff-filter=D"]),
    ...gitLines(repo, ["diff", "--name-only", "--diff-filter=D"]),
  ];
  const untracked = gitLines(repo, ["ls-files", "--others", "--exclude-standard"]);
  const status = runGit(repo, ["status", "--porcelain=v1"]).stdout;
  return {
    branch,
    headSha,
    baseSha,
    staged: unique(staged),
    unstaged: unique(unstaged),
    untracked: unique(untracked),
    deleted: unique(deleted),
    initialStatus: status,
  };
}

export function listTrackedFiles(repo: string): string[] {
  return gitLines(repo, ["ls-files"]);
}

export function isIgnored(repo: string, relPath: string): boolean {
  const result = runGit(repo, ["check-ignore", "-q", relPath]);
  return result.code === 0;
}

export function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
