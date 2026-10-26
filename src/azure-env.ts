import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findKitRoot } from "./kit-root.js";

const PAT_KEYS = ["AZURE_DEVOPS_EXT_PAT", "AZURE_DEVOPS_PAT"] as const;

export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function azureEnvFiles(target?: string): string[] {
  const files: string[] = [];
  if (process.env.TEAM_AI_AZURE_ENV) files.push(process.env.TEAM_AI_AZURE_ENV);
  if (target) files.push(join(target, ".env"));
  try {
    const kitRoot = findKitRoot();
    files.push(join(kitRoot, ".env"));
    files.push(join(dirname(kitRoot), "tl-control", ".env"));
  } catch {
    // tests u otros árboles sin kit
  }
  return files;
}

function patFromRecord(record: Record<string, string | undefined>): string | undefined {
  for (const key of PAT_KEYS) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** PAT como tl-control. Nunca loguear el valor. */
export function azurePat(target?: string): string | undefined {
  const fromProcess = patFromRecord(process.env);
  if (fromProcess) return fromProcess;
  for (const file of azureEnvFiles(target)) {
    const fromFile = patFromRecord(parseEnvFile(file));
    if (fromFile) return fromFile;
  }
  return undefined;
}

export function hasAzurePat(target?: string): boolean {
  return Boolean(azurePat(target));
}

export const AZURE_PAT_MISSING =
  "Sin PAT. Definí AZURE_DEVOPS_EXT_PAT o AZURE_DEVOPS_PAT en un .env local (igual que tl-control): repo de producto, carpeta del kit, o tl-control. No lo pegues en el chat.";
