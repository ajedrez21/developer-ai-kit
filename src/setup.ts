import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { claudeMcpServer, cursorMcpServer, MCP_SERVER_NAME, WRITE_TOOLS } from "./mcp.js";
import { mergeNamedRecord, removeNamedRecord, upsertManagedBlock } from "./merge.js";
import { discoverOpenSpec } from "./openspec.js";
import { DEFAULT_POLICY, loadManifest, writeManifest, writePolicy } from "./policy.js";
import { sha256Prefixed } from "./hash.js";
import { findKitRoot, KIT_VERSION, posixPath } from "./kit-root.js";
import type { Host, KitManifest, ManagedFile, Role } from "./types.js";

export interface SetupOptions {
  target: string;
  role: Role;
  hosts: Host[];
  organization?: string;
  project?: string;
  securitySkillPath?: string;
  dryRun?: boolean;
  version?: string;
}

export interface SetupReport {
  actions: string[];
  managedFiles: ManagedFile[];
  warnings: string[];
}

const SKILL_NAMES = [
  "work-item",
  "work-propose",
  "work-apply",
  "verify-change",
  "security-review",
  "security-fix",
  "commit-change",
  "pr-ready",
  "knowledge-backend",
  "knowledge-frontend",
  "knowledge-testing",
];

export function setup(options: SetupOptions): SetupReport {
  const kitRoot = findKitRoot();
  const target = options.target;
  const actions: string[] = [];
  const warnings: string[] = [];
  const managedFiles: ManagedFile[] = [];
  mkdirSync(join(target, ".ai"), { recursive: true });

  const writes: Array<{ path: string; content: string; kind: ManagedFile["kind"] }> = [];
  const generatedSkills = generateSkills(kitRoot, options.hosts);
  for (const skill of generatedSkills) writes.push(skill);

  writes.push(...generateRules(kitRoot, options.role, options.hosts));
  writes.push(...generateMcp(options));
  writes.push(...generateHooks(kitRoot, options.hosts));
  writes.push(...generateIgnoreAndState(options));
  writes.push(...generateOpenSpecCommands(target, options.hosts));
  writes.push({
    path: "CLAUDE.md",
    content: mergeClaudeMd(readOptional(join(target, "CLAUDE.md")), claudeBlock(options)),
    kind: "merged-block",
  });
  writes.push({
    path: "AGENTS.md",
    content: mergeClaudeMd(readOptional(join(target, "AGENTS.md")), agentsBlock(options)),
    kind: "merged-block",
  });

  const existingManifest = loadManifest(target);
  if (options.dryRun) {
    for (const file of writes) {
      const abs = join(target, file.path);
      const current = readOptional(abs);
      if (current === file.content) actions.push(`unchanged ${file.path}`);
      else actions.push(`would ${current == null ? "create" : "update"} ${file.path}`);
    }
    return { actions, managedFiles, warnings };
  }

  const backupDir = join(target, ".ai", "backups", timestamp());
  for (const file of writes) {
    const abs = join(target, file.path);
    const current = readOptional(abs);
    if (current === file.content) {
      actions.push(`unchanged ${file.path}`);
    } else {
      if (current != null) {
        mkdirSync(join(backupDir, dirname(file.path)), { recursive: true });
        writeFileSync(join(backupDir, file.path), current, "utf8");
      }
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content, file.path.endsWith(".js") ? "utf8" : "utf8");
      actions.push(`${current == null ? "created" : "updated"} ${file.path}`);
    }
    managedFiles.push({ path: posixPath(file.path), hash: sha256Prefixed(file.content), kind: file.kind });
  }

  if (options.hosts.includes("cursor")) {
    const content = mergeCursorHooks(target, false);
    managedFiles.push({ path: ".cursor/hooks.json", hash: sha256Prefixed(content), kind: "merged-block" });
    actions.push("merged .cursor/hooks.json");
  }
  if (options.hosts.includes("claude")) {
    const content = mergeClaudeSettings(target, false);
    managedFiles.push({ path: ".claude/settings.json", hash: sha256Prefixed(content), kind: "merged-block" });
    actions.push("merged .claude/settings.json");
  }
  const gitHook = installGitPrePush(target, false);
  managedFiles.push({ path: ".git/hooks/pre-push", hash: sha256Prefixed(gitHook), kind: "merged-block" });
  actions.push("merged git pre-push");

  writePolicy(target, DEFAULT_POLICY);
  const security = resolveSecuritySkill(options.securitySkillPath);
  if (security.status !== "configured") warnings.push(`Skill de seguridad: ${security.status}`);
  const openspec = discoverOpenSpec(target);
  if (!openspec.installed) warnings.push("OpenSpec no está inicializado en el proyecto. Ejecutar `openspec init --tools claude,cursor`.");
  const manifest: KitManifest = {
    kitVersion: options.version ?? KIT_VERSION,
    installedAt: existingManifest?.installedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: { corePath: kitRoot, coreVersion: KIT_VERSION },
    hosts: options.hosts,
    role: options.role,
    supportedVersions: {
      node: ">=20.19.0",
      openspec: "CLI + /opsx:propose|/opsx-propose",
      azureDevOpsMcp: "@azure-devops/mcp@1.4.0",
      securityCompliance: "1.0.0",
    },
    installedVersions: {
      node: process.version,
      openspec: openspec.version ?? "not_installed",
      kit: options.version ?? KIT_VERSION,
    },
    managedFiles,
    userCustomizations: detectCustomizations(target, managedFiles, existingManifest),
    securitySkill: security,
    azure: {
      organization: options.organization ?? null,
      project: options.project ?? null,
      mcpProfile: "developer-read",
    },
  };
  writeManifest(target, manifest);
  actions.push("updated .ai/kit-manifest.json");
  return { actions, managedFiles, warnings };
}

export function update(options: SetupOptions): SetupReport {
  const manifest = loadManifest(options.target);
  if (!manifest) return setup(options);
  const requested = options.version ?? KIT_VERSION;
  if (requested !== KIT_VERSION) {
    throw new Error(`La versión pedida ${requested} no coincide con el core disponible ${KIT_VERSION}. No se cambia de versión sin registro.`);
  }
  return setup({
    ...options,
    role: options.role || manifest.role,
    hosts: options.hosts.length ? options.hosts : manifest.hosts,
    organization: options.organization ?? manifest.azure.organization ?? undefined,
    project: options.project ?? manifest.azure.project ?? undefined,
    version: requested,
  });
}

export function uninstall(target: string, dryRun = false): SetupReport {
  const manifest = loadManifest(target);
  if (!manifest) throw new Error("No hay kit instalado (.ai/kit-manifest.json).");
  const actions: string[] = [];
  for (const file of manifest.managedFiles) {
    const abs = join(target, file.path);
    if (!existsSync(abs)) {
      actions.push(`missing ${file.path}`);
      continue;
    }
    const isJsonMerge =
      file.path.endsWith("mcp.json") ||
      file.path.endsWith(".mcp.json") ||
      file.path.endsWith("hooks.json") ||
      file.path.endsWith("settings.json");
    if (isJsonMerge) {
      const current = readFileSync(abs, "utf8");
      if (dryRun) {
        actions.push(`would unmerge ${file.path}`);
        continue;
      }
      try {
        if (file.path.endsWith("hooks.json")) {
          const json = JSON.parse(current) as { hooks?: Record<string, Array<{ command?: string }>> };
          if (json.hooks) {
            for (const [event, list] of Object.entries(json.hooks)) {
              json.hooks[event] = list.filter((item) => !String(item.command ?? "").includes(".ai/hooks/"));
            }
          }
          writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`, "utf8");
        } else if (file.path.endsWith("mcp.json") || file.path.endsWith(".mcp.json")) {
          writeFileSync(abs, removeNamedRecord(current, "mcpServers", MCP_SERVER_NAME), "utf8");
        } else {
          const json = JSON.parse(current) as { hooks?: { PreToolUse?: unknown[] } };
          if (json.hooks?.PreToolUse) {
            json.hooks.PreToolUse = json.hooks.PreToolUse.filter((item) => !JSON.stringify(item).includes("mcp-guard"));
          }
          writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`, "utf8");
        }
        actions.push(`unmerged ${file.path}`);
      } catch {
        actions.push(`left ${file.path} (JSON no parseable; no se borra config de usuario)`);
      }
      continue;
    }
    if (file.path.replaceAll("\\", "/").endsWith(".git/hooks/pre-push")) {
      const current = readFileSync(abs, "utf8");
      const next = current.replace(/\n# TEAM-AI-KIT\nnode \.ai\/hooks\/git-pre-push\.cjs\n?/g, "\n");
      if (dryRun) actions.push(`would strip kit snippet ${file.path}`);
      else {
        writeFileSync(abs, next, "utf8");
        actions.push(`stripped ${file.path}`);
      }
      continue;
    }
    if (file.kind === "merged-block") {
      const current = readFileSync(abs, "utf8");
      const next = stripSimple(current);
      if (dryRun) actions.push(`would strip block ${file.path}`);
      else {
        writeFileSync(abs, next, "utf8");
        actions.push(`stripped ${file.path}`);
      }
      continue;
    }
    if (dryRun) actions.push(`would remove ${file.path}`);
    else {
      rmSync(abs, { force: true });
      actions.push(`removed ${file.path}`);
    }
  }
  if (!dryRun) {
    rmSync(join(target, ".ai", "kit-manifest.json"), { force: true });
    actions.push("removed .ai/kit-manifest.json");
  }
  return { actions, managedFiles: [], warnings: [] };
}

function generateSkills(kitRoot: string, hosts: Host[]): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  const out: Array<{ path: string; content: string; kind: ManagedFile["kind"] }> = [];
  for (const name of SKILL_NAMES) {
    const source = join(kitRoot, "skills", name, "SKILL.md");
    if (!existsSync(source)) continue;
    const body = readFileSync(source, "utf8");
    const generated = `<!-- Generated by @team-ai/engineering-kit ${KIT_VERSION}. Do not edit. Source: skills/${name}/SKILL.md -->\n${body}`;
    if (hosts.includes("cursor")) {
      out.push({ path: `.cursor/skills/${name}/SKILL.md`, content: generated, kind: "generated" });
    }
    if (hosts.includes("claude")) {
      out.push({ path: `.claude/skills/${name}/SKILL.md`, content: generated, kind: "generated" });
    }
  }
  return out;
}

function generateRules(kitRoot: string, role: Role, hosts: Host[]): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  const out: Array<{ path: string; content: string; kind: ManagedFile["kind"] }> = [];
  const files = [
    ["common", "team-ai-common.mdc"],
    [role === "frontend" ? "frontend" : "backend", role === "frontend" ? "team-ai-frontend.mdc" : "team-ai-backend.mdc"],
    ["testing", "team-ai-testing.mdc"],
  ];
  for (const [folder, filename] of files) {
    const source = join(kitRoot, "rules", folder, filename.replace("team-ai-", ""));
    const fallback = join(kitRoot, "rules", folder, `${folder}.md`);
    const path = existsSync(source) ? source : fallback;
    if (!existsSync(path)) continue;
    const body = readFileSync(path, "utf8");
    if (hosts.includes("cursor")) {
      out.push({
        path: `.cursor/rules/${filename}`,
        content: body.startsWith("---") ? body : `---\ndescription: Team AI ${folder} rules\nalwaysApply: ${folder === "common" ? "true" : "false"}\n---\n\n${body}`,
        kind: "generated",
      });
    }
  }
  return out;
}

function generateMcp(options: SetupOptions): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  const org = options.organization?.trim() ? options.organization : "${AZURE_DEVOPS_ORG}";
  const out: Array<{ path: string; content: string; kind: ManagedFile["kind"] }> = [];
  if (options.hosts.includes("cursor")) {
    const existing = readOptional(join(options.target, ".cursor", "mcp.json"));
    const cursorOrg = options.organization ? options.organization : "${env:AZURE_DEVOPS_ORG}";
    const merged = mergeNamedRecord(existing, "mcpServers", MCP_SERVER_NAME, cursorMcpServer(cursorOrg));
    out.push({ path: ".cursor/mcp.json", content: merged.content, kind: "merged-block" });
  }
  if (options.hosts.includes("claude")) {
    const existing = readOptional(join(options.target, ".mcp.json"));
    const merged = mergeNamedRecord(existing, "mcpServers", MCP_SERVER_NAME, claudeMcpServer(org));
    out.push({ path: ".mcp.json", content: merged.content, kind: "merged-block" });
  }
  out.push({
    path: ".ai/mcp-allowlist.json",
    content: `${JSON.stringify({ profile: "developer-read", denyTools: WRITE_TOOLS, note: "Los dominios del servidor MCP local aún exponen herramientas de escritura. El bloqueo técnico es el hook beforeMCPExecution / PreToolUse del kit. Sin ese hook el perfil no está restringido." }, null, 2)}\n`,
    kind: "generated",
  });
  return out;
}

function generateHooks(kitRoot: string, hosts: Host[]): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  const out: Array<{ path: string; content: string; kind: ManagedFile["kind"] }> = [];
  const mcpGuard = readFileSync(join(kitRoot, "templates", "hooks", "mcp-guard.cjs"), "utf8");
  const invalidate = readFileSync(join(kitRoot, "templates", "hooks", "invalidate-gates.cjs"), "utf8");
  const prePush = readFileSync(join(kitRoot, "templates", "hooks", "git-pre-push.cjs"), "utf8");
  out.push({ path: ".ai/hooks/mcp-guard.cjs", content: mcpGuard, kind: "generated" });
  out.push({ path: ".ai/hooks/invalidate-gates.cjs", content: invalidate, kind: "generated" });
  out.push({ path: ".ai/hooks/git-pre-push.cjs", content: prePush, kind: "generated" });
  void hosts;
  return out;
}

function generateIgnoreAndState(options: SetupOptions): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  return [
    {
      path: ".ai/.gitignore",
      content: "work-items/\nsecurity/\ntmp/\nbackups/\n*.token\n*.env\n",
      kind: "generated",
    },
    {
      path: ".ai/README.md",
      content: `# Estado local Team AI Kit ${KIT_VERSION}\n\nNo commitear work-items ni reportes de seguridad. El manifiesto sí se versiona.\nRol: ${options.role}\nHosts: ${options.hosts.join(", ")}\n`,
      kind: "generated",
    },
  ];
}

function generateOpenSpecCommands(target: string, hosts: Host[]): Array<{ path: string; content: string; kind: ManagedFile["kind"] }> {
  const discovered = discoverOpenSpec(target);
  return [
    {
      path: ".ai/openspec-commands.json",
      content: `${JSON.stringify({ ...discovered, hosts }, null, 2)}\n`,
      kind: "generated",
    },
  ];
}

function mergeClaudeMd(existing: string | null, block: string): string {
  return upsertManagedBlock(existing, block, "md").content;
}

function claudeBlock(options: SetupOptions): string {
  return `# Team AI Kit ${KIT_VERSION}

Usá las skills del kit para el flujo Azure → OpenSpec → verify → security → commit → PR.
Comandos lógicos: /work-item /work-propose /work-apply /verify-change /security-review /security-fix /commit-change /pr-ready.
OpenSpec nativo: Claude \`/opsx:propose\` y \`/opsx:apply\`. No inventar \`/ospx-*\`.
MCP developer: servidor \`${MCP_SERVER_NAME}\`; no uses herramientas *_write. Rol instalado: ${options.role}.
Ejecutá scripts con \`npx team-ai\` o \`node node_modules/@team-ai/engineering-kit/dist/cli.js\`.`;
}

function agentsBlock(options: SetupOptions): string {
  return claudeBlock(options).replace("Claude `/opsx:propose`", "Cursor `/opsx-propose` (Claude: `/opsx:propose`)");
}

function resolveSecuritySkill(explicit?: string): KitManifest["securitySkill"] {
  const candidates = [
    explicit,
    process.env.TEAM_AI_SECURITY_SKILL,
    join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".cursor", "skills", "security-compliance"),
    join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".claude", "skills", "security-compliance"),
  ].filter((value): value is string => Boolean(value));
  for (const dir of candidates) {
    if (existsSync(join(dir, "SKILL.md"))) {
      const version = existsSync(join(dir, "VERSION")) ? readFileSync(join(dir, "VERSION"), "utf8").trim() : null;
      return { name: "security-compliance", path: dir, version, status: "configured" };
    }
  }
  return { name: "security-compliance", path: null, version: null, status: "not_found" };
}

function detectCustomizations(target: string, managed: ManagedFile[], previous: KitManifest | null): string[] {
  const listed = new Set(managed.map((file) => file.path));
  const extras: string[] = [];
  for (const rel of [".cursor/rules", ".claude/skills", ".cursor/skills"]) {
    const abs = join(target, rel);
    if (!existsSync(abs)) continue;
    walk(abs, (file) => {
      const posix = posixPath(relative(target, file));
      if (!listed.has(posix) && !posix.includes("openspec-")) extras.push(posix);
    });
  }
  return [...new Set([...(previous?.userCustomizations ?? []), ...extras])];
}

function walk(dir: string, visit: (file: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, visit);
    else visit(abs);
  }
}

function readOptional(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
}

function stripSimple(content: string): string {
  const begin = "<!-- TEAM-AI-KIT:BEGIN -->";
  const end = "<!-- TEAM-AI-KIT:END -->";
  const a = content.indexOf(begin);
  const b = content.indexOf(end);
  if (a === -1 || b === -1) return content;
  return `${content.slice(0, a)}${content.slice(b + end.length)}`;
}

export function mergeCursorHooks(target: string, dryRun: boolean): string {
  const path = join(target, ".cursor", "hooks.json");
  const existing = readOptional(path);
  const kitHooks = {
    beforeMCPExecution: [{ command: "node .ai/hooks/mcp-guard.cjs" }],
    afterFileEdit: [{ command: "node .ai/hooks/invalidate-gates.cjs" }],
  };
  let json: { version: number; hooks: Record<string, Array<{ command: string }>> } = existing
    ? (JSON.parse(existing) as typeof json)
    : { version: 1, hooks: {} };
  json.version = json.version ?? 1;
  json.hooks = json.hooks ?? {};
  for (const [event, list] of Object.entries(kitHooks)) {
    const current = json.hooks[event] ?? [];
    for (const item of list) {
      if (!current.some((entry) => entry.command === item.command)) current.push(item);
    }
    json.hooks[event] = current;
  }
  const content = `${JSON.stringify(json, null, 2)}\n`;
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return content;
}

export function mergeClaudeSettings(target: string, dryRun: boolean): string {
  const path = join(target, ".claude", "settings.json");
  const existing = readOptional(path);
  const kit = {
    matcher: "mcp__.*write|wit_work_item_write|repo_pull_request_write",
    hooks: [{ type: "command", command: "node .ai/hooks/mcp-guard.cjs" }],
  };
  let json: { hooks?: { PreToolUse?: unknown[] } } = existing ? JSON.parse(existing) : {};
  json.hooks = json.hooks ?? {};
  json.hooks.PreToolUse = json.hooks.PreToolUse ?? [];
  const list = json.hooks.PreToolUse as Array<Record<string, unknown>>;
  if (!list.some((item) => JSON.stringify(item).includes("mcp-guard.cjs"))) list.push(kit);
  const content = `${JSON.stringify(json, null, 2)}\n`;
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return content;
}

export function installGitPrePush(target: string, dryRun: boolean): string {
  const hook = join(target, ".git", "hooks", "pre-push");
  const snippet = `node .ai/hooks/git-pre-push.cjs\n`;
  const existing = readOptional(hook);
  if (existing?.includes(".ai/hooks/git-pre-push.cjs")) return existing;
  const content = existing
    ? `${existing.trimEnd()}\n\n# TEAM-AI-KIT\n${snippet}`
    : `#!/usr/bin/env node\nconst { spawnSync } = require("node:child_process");\nconst r = spawnSync(process.execPath, [".ai/hooks/git-pre-push.cjs"], { stdio: "inherit" });\nprocess.exit(r.status ?? 1);\n`;
  if (!dryRun && existsSync(join(target, ".git"))) {
    mkdirSync(dirname(hook), { recursive: true });
    writeFileSync(hook, content, "utf8");
  }
  return content;
}

void spawnSync;
void copyFileSync;
void readdirSync;
