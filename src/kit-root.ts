import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_VERSION = "1.0.0";
export const SCHEMA_VERSION = "team-ai/v1";
export const MANAGED_BEGIN = "TEAM-AI-KIT:BEGIN";
export const MANAGED_END = "TEAM-AI-KIT:END";

export function findKitRoot(startDir = dirname(fileURLToPath(import.meta.url))): string {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    const versionPath = join(current, "VERSION");
    const pkgPath = join(current, "package.json");
    if (existsSync(versionPath) && existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "@team-ai/engineering-kit") return current;
      } catch {
        // keep walking
      }
    }
    current = dirname(current);
  }
  throw new Error("No se encontró la raíz del kit (VERSION + package.json @team-ai/engineering-kit).");
}

export function posixPath(input: string): string {
  return input.replaceAll("\\", "/");
}
