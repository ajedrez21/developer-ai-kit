import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WRITE_TOOLS } from "./mcp.js";
import { discoverOpenSpec } from "./openspec.js";
import { loadManifest } from "./policy.js";
import { KIT_VERSION } from "./kit-root.js";

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
    detail: manifest ? `v${manifest.kitVersion} (core ${KIT_VERSION})` : "Falta .ai/kit-manifest.json. Ejecutar team-ai setup.",
  });
  if (manifest && manifest.kitVersion !== KIT_VERSION) {
    checks.push({
      id: "drift-version",
      title: "Drift de versión",
      level: "limitation",
      ok: false,
      detail: `Instalada ${manifest.kitVersion}, disponible ${KIT_VERSION}. Ejecutar team-ai update.`,
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
