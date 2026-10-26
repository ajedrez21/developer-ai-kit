import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hasAzurePat } from "./azure-env.js";
import { AZURE_MCP_PINNED, MCP_SERVER_NAME, WRITE_TOOLS } from "./mcp.js";
import { discoverOpenSpec } from "./openspec.js";
import { loadManifest } from "./policy.js";
import { KIT_VERSION, kitCliPath, posixPath } from "./kit-root.js";
import type { KitManifest } from "./types.js";

export type DoctorLevel = "installed" | "available" | "authenticated" | "authorized" | "not_configured" | "limitation";

export interface DoctorCheck {
  id: string;
  title: string;
  level: DoctorLevel;
  ok: boolean;
  detail: string;
}

export function doctor(target: string): { checks: DoctorCheck[]; summary: string } {
  const checks: DoctorCheck[] = [];
  const manifest = loadManifest(target);
  checks.push({
    id: "kit",
    title: "Kit instalado",
    level: manifest ? "installed" : "not_configured",
    ok: Boolean(manifest),
    detail: manifest ? `v${manifest.kitVersion} (core ${KIT_VERSION})` : "Falta .ai/kit-manifest.json. Ejecutar setup del kit.",
  });
  if (manifest && manifest.kitVersion !== KIT_VERSION) {
    checks.push({
      id: "drift-version",
      title: "Drift de versión",
      level: "limitation",
      ok: false,
      detail: `Instalada ${manifest.kitVersion}, disponible ${KIT_VERSION}. Ejecutar update del kit.`,
    });
  }
  checks.push(runtime("node", process.version, ">=20.19.0", Number(process.versions.node.split(".")[0]) >= 20));
  checks.push(binary("git", ["--version"]));
  const openspec = discoverOpenSpec(target);
  checks.push({
    id: "openspec",
    title: "OpenSpec",
    level: openspec.installed ? "installed" : "not_configured",
    ok: openspec.compatible && Boolean(openspec.version || openspec.installed),
    detail: [
      openspec.version ? `CLI ${openspec.version}` : "CLI no disponible",
      `perfil ${openspec.profile}`,
      openspec.verifyAvailable ? "verify disponible" : "verify NO instalado (no fingir el comando)",
      `Claude ${openspec.commandsByHost.claude.propose}`,
      `Cursor ${openspec.commandsByHost.cursor.propose}`,
    ].join("; "),
  });
  const securityPath = manifest?.securitySkill.path;
  checks.push({
    id: "security-skill",
    title: "Skill security-compliance",
    level: securityPath ? "installed" : "not_configured",
    ok: Boolean(securityPath && existsSync(join(securityPath, "SKILL.md"))),
    detail: securityPath ? `Referenciada en ${securityPath}` : "No encontrada. Configurar TEAM_AI_SECURITY_SKILL.",
  });
  const mcpCursor = existsSync(join(target, ".cursor", "mcp.json"));
  const mcpClaude = existsSync(join(target, ".mcp.json"));
  checks.push({
    id: "mcp-config",
    title: "MCP Azure DevOps (config)",
    level: mcpCursor || mcpClaude ? "installed" : "not_configured",
    ok: mcpCursor || mcpClaude,
    detail: `Cursor .cursor/mcp.json=${mcpCursor}; Claude .mcp.json=${mcpClaude}. Autenticación: az cli / OAuth del usuario, nunca en el repo.`,
  });
  checks.push(cliResolvable(manifest));
  checks.push(mcpPin(target));
  checks.push(mcpPackagePublished());
  const patOk = hasAzurePat(target);
  checks.push({
    id: "azure-pat",
    title: "PAT Azure (tl-control)",
    level: patOk ? "authenticated" : "not_configured",
    ok: patOk,
    detail: patOk
      ? "PAT presente en entorno o .env local (no se muestra)."
      : "Sin AZURE_DEVOPS_EXT_PAT ni AZURE_DEVOPS_PAT. El CLI work-item no puede leer Azure. Definí un .env local igual que tl-control.",
  });
  checks.push({
    id: "mcp-auth",
    title: "MCP autenticado",
    level: "not_configured",
    ok: false,
    detail: "No se puede afirmar autenticación/autorización sin una llamada real. Doctor no imprime tokens.",
  });
  const allowlist = existsSync(join(target, ".ai", "mcp-allowlist.json"));
  const hook = existsSync(join(target, ".ai", "hooks", "mcp-guard.cjs"));
  checks.push({
    id: "mcp-write-guard",
    title: "Perfil developer de solo lectura",
    level: hook ? "installed" : "limitation",
    ok: hook && allowlist,
    detail: hook
      ? `Hook mcp-guard niega ${WRITE_TOOLS.length} herramientas de escritura. Los dominios MCP locales todavía las anuncian; sin hook NO declarar perfil restringido.`
      : "Sin hook de deny-list el servidor MCP no es de solo lectura.",
  });
  if (manifest) {
    const drifted = manifest.managedFiles.filter((file) => {
      const abs = join(target, file.path);
      if (!existsSync(abs)) return true;
      const current = `sha256:${createHash("sha256").update(readFileSync(abs)).digest("hex")}`;
      return current !== file.hash && file.kind === "generated";
    });
    checks.push({
      id: "drift-files",
      title: "Drift de archivos generados",
      level: drifted.length ? "limitation" : "installed",
      ok: drifted.length === 0,
      detail: drifted.length ? drifted.map((file) => file.path).join(", ") : "sin drift de generated",
    });
  }
  const failed = checks.filter((check) => !check.ok);
  return {
    checks,
    summary: failed.length ? `${failed.length} chequeos no OK` : "doctor OK (con limitaciones de auth Azure si aplica)",
  };
}

function runtime(id: string, actual: string, expected: string, ok: boolean): DoctorCheck {
  return { id, title: id, level: ok ? "installed" : "not_configured", ok, detail: `${actual} (requiere ${expected})` };
}

function binary(name: string, args: string[]): DoctorCheck {
  const result = spawnSync(name, args, { encoding: "utf8", windowsHide: true });
  const ok = result.status === 0;
  return {
    id: name,
    title: name,
    level: ok ? "installed" : "not_configured",
    ok,
    detail: ok ? (result.stdout || "").trim() : `${name} no disponible`,
  };
}

function cliResolvable(manifest: KitManifest | null): DoctorCheck {
  const corePath = manifest?.source.corePath;
  const cli = corePath ? kitCliPath(corePath) : null;
  const ok = Boolean(cli && existsSync(cli));
  return {
    id: "cli-resolvable",
    title: "CLI del kit resoluble",
    level: ok ? "installed" : "not_configured",
    ok,
    detail: ok
      ? `node "${posixPath(cli!)}"`
      : corePath
        ? `No existe dist/cli.js en ${corePath}. Compilá el kit (npm run build) o corré setup de nuevo.`
        : "Falta source.corePath en el manifiesto. Ejecutar setup.",
  };
}

function mcpPin(target: string): DoctorCheck {
  const files = [join(".cursor", "mcp.json"), ".mcp.json"];
  const hits: string[] = [];
  let seen = 0;
  let pinned = 0;
  for (const rel of files) {
    const abs = join(target, rel);
    if (!existsSync(abs)) continue;
    try {
      const json = JSON.parse(readFileSync(abs, "utf8")) as {
        mcpServers?: Record<string, { args?: unknown }>;
      };
      const args = json.mcpServers?.[MCP_SERVER_NAME]?.args;
      if (!Array.isArray(args)) continue;
      seen += 1;
      const list = args.map(String);
      const hasPin = list.includes(AZURE_MCP_PINNED);
      if (hasPin) pinned += 1;
      const found = list.find((item) => item.includes("@azure-devops/mcp")) ?? "sin paquete";
      hits.push(`${posixPath(rel)}: ${hasPin ? AZURE_MCP_PINNED : found}`);
    } catch {
      hits.push(`${posixPath(rel)}: JSON no parseable`);
    }
  }
  const ok = seen > 0 && pinned === seen;
  return {
    id: "mcp-pin",
    title: "MCP versión fijada",
    level: ok ? "installed" : "not_configured",
    ok,
    detail: hits.length ? hits.join("; ") : `No hay mcp.json. Se espera ${AZURE_MCP_PINNED}.`,
  };
}

function mcpPackagePublished(): DoctorCheck {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["view", AZURE_MCP_PINNED, "version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 8000,
  });
  const err = `${result.stderr ?? ""}${result.error?.message ?? ""}`.trim();
  const missing = /ETARGET|No matching version|E404/i.test(err);
  if (result.error || result.status !== 0) {
    return {
      id: "mcp-package",
      title: "MCP publicado en npm",
      level: missing ? "not_configured" : "limitation",
      ok: !missing,
      detail: missing
        ? `${AZURE_MCP_PINNED} no existe en npm.`
        : `No se pudo consultar npm (${err.slice(0, 160) || "timeout/offline"}). Pin local: ${AZURE_MCP_PINNED}.`,
    };
  }
  return {
    id: "mcp-package",
    title: "MCP publicado en npm",
    level: "installed",
    ok: true,
    detail: `npm view → ${(result.stdout || "").trim() || AZURE_MCP_PINNED}`,
  };
}
