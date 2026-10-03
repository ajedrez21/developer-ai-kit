/**
 * Helpers de repos git temporales. No usa bash ni symlinks.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export function tempDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function git(repo: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")}`);
  return result.stdout;
}

export function initUserRepo(): string {
  const dir = tempDir("team-ai-user");
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "dev@example.com"]);
  git(dir, ["config", "user.name", "Dev"]);
  writeFileSync(join(dir, "README.md"), "# user repo\n", "utf8");
  writeFileSync(join(dir, "CLAUDE.md"), "# reglas del usuario\nNo borrar.\n", "utf8");
  mkdirSync(join(dir, ".cursor"), { recursive: true });
  writeFileSync(join(dir, ".cursor", "mcp.json"), `${JSON.stringify({ mcpServers: { sonar: { command: "npx", args: ["sonarqube"] } } }, null, 2)}\n`);
  mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
  writeFileSync(join(dir, ".git", "hooks", "pre-push"), "#!/bin/sh\necho user-hook\n", "utf8");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "shop-api", scripts: { lint: "node -e \"process.exit(0)\"" } }, null, 2),
  );
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
