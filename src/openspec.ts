import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "./git.js";

export interface OpenSpecCommands {
  propose: string;
  apply: string;
  update: string;
  archive: string;
  verify: string | null;
  explore: string;
}

export interface OpenSpecDiscovery {
  installed: boolean;
  version: string | null;
  compatible: boolean;
  profile: "core" | "expanded" | "unknown";
  verifyAvailable: boolean;
  commandsByHost: {
    claude: OpenSpecCommands;
    cursor: OpenSpecCommands;
  };
  aliases: Record<string, string>;
  traces: string[];
}

const CLAUDE: OpenSpecCommands = {
  propose: "/opsx:propose",
  apply: "/opsx:apply",
  update: "/opsx:update",
  archive: "/opsx:archive",
  verify: "/opsx:verify",
  explore: "/opsx:explore",
};

const CURSOR: OpenSpecCommands = {
  propose: "/opsx-propose",
  apply: "/opsx-apply",
  update: "/opsx-update",
  archive: "/opsx-archive",
  verify: "/opsx-verify",
  explore: "/opsx-explore",
};

export function discoverOpenSpec(target: string): OpenSpecDiscovery {
  const traces: string[] = [];
  const version = detectOpenSpecVersion(traces);
  const hasConfig = existsSync(join(target, "openspec", "config.yaml")) || existsSync(join(target, "openspec"));
  const claudePropose = existsSync(join(target, ".claude", "commands", "opsx", "propose.md"));
  const cursorPropose = existsSync(join(target, ".cursor", "commands", "opsx-propose.md"));
  const verifyAvailable =
    existsSync(join(target, ".cursor", "skills", "openspec-verify-change", "SKILL.md")) ||
    existsSync(join(target, ".claude", "skills", "openspec-verify-change", "SKILL.md")) ||
    existsSync(join(target, ".cursor", "commands", "opsx-verify.md")) ||
    existsSync(join(target, ".claude", "commands", "opsx", "verify.md"));
  if (hasConfig) traces.push("openspec/ detectado en el proyecto");
  if (claudePropose) traces.push("comando Claude /opsx:propose presente");
  if (cursorPropose) traces.push("comando Cursor /opsx-propose presente");
  traces.push(verifyAvailable ? "verify de OpenSpec detectado (perfil expandido)" : "verify de OpenSpec no instalado; no fingir /opsx:verify");
  return {
    installed: Boolean(version || hasConfig || claudePropose || cursorPropose),
    version,
    compatible: version !== "incompatible",
    profile: verifyAvailable ? "expanded" : hasConfig || version ? "core" : "unknown",
    verifyAvailable,
    commandsByHost: {
      claude: { ...CLAUDE, verify: verifyAvailable ? CLAUDE.verify : null },
      cursor: { ...CURSOR, verify: verifyAvailable ? CURSOR.verify : null },
    },
    aliases: {
      "/work-propose": "wrapper del kit que invoca propose nativo de OpenSpec",
      "/work-apply": "wrapper del kit que invoca apply nativo de OpenSpec",
      "/opsx:propose": CLAUDE.propose,
      "/opsx-propose": CURSOR.propose,
    },
    traces,
  };
}

function detectOpenSpecVersion(traces: string[]): string | null {
  const result = runProcess("openspec", ["--version"]);
  if (result) {
    traces.push(`openspec CLI ${result}`);
    return result;
  }
  traces.push("openspec CLI no está en PATH");
  return null;
}

function runProcess(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status === 0) return (result.stdout || "").trim() || "unknown";
  return null;
}

export function findChangeDir(target: string, changeId: string): string | null {
  const dir = join(target, "openspec", "changes", changeId);
  return existsSync(dir) ? dir : null;
}

export function parseTasks(tasksMd: string): { total: number; completed: number; items: Array<{ text: string; done: boolean }> } {
  const items = [...tasksMd.matchAll(/^[-*] \[( |x|X)\] (.+)$/gm)].map((match) => ({
    done: match[1].toLowerCase() === "x",
    text: match[2],
  }));
  return { total: items.length, completed: items.filter((item) => item.done).length, items };
}

export function listChangeFiles(target: string, changeId: string): { proposal: string; design: string; tasks: string; specs: string[] } | null {
  const dir = findChangeDir(target, changeId);
  if (!dir) return null;
  const specsDir = join(dir, "specs");
  return {
    proposal: join(dir, "proposal.md"),
    design: join(dir, "design.md"),
    tasks: join(dir, "tasks.md"),
    specs: existsSync(specsDir)
      ? readdirSync(specsDir).filter((name) => name.endsWith(".md")).map((name) => join(specsDir, name))
      : [],
  };
}

export function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function foreignChanges(snapshotStatus: string, ownedFiles: string[]): string[] {
  const owned = new Set(ownedFiles.map((file) => file.replaceAll("\\", "/")));
  return snapshotStatus
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({ raw: line, path: line.slice(3).replaceAll("\\", "/").trim() }))
    .filter((entry) => entry.path && !owned.has(entry.path) && !entry.path.startsWith(".ai/"))
    .map((entry) => entry.raw);
}

export function detectUserDirtyState(statusPorcelain: string): { staged: string[]; unstaged: string[]; untracked: string[] } {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  for (const line of statusPorcelain.split(/\r?\n/)) {
    if (!line) continue;
    const path = line.slice(3).replaceAll("\\", "/");
    if (line.startsWith("??")) untracked.push(path);
    else {
      if (line[0] !== " ") staged.push(path);
      if (line[1] !== " ") unstaged.push(path);
    }
  }
  return { staged, unstaged, untracked };
}

export function gitUserName(repo: string): string {
  const { stdout } = runGit(repo, ["config", "user.name"]);
  return stdout.trim() || "developer";
}
