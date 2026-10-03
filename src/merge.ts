import { MANAGED_BEGIN, MANAGED_END } from "./kit-root.js";

export interface MergeResult {
  content: string;
  changed: boolean;
  action: "created" | "updated" | "unchanged" | "skipped-user";
}

export function upsertManagedBlock(existing: string | null, blockBody: string, comment: "md" | "jsonc" = "md"): MergeResult {
  const begin = comment === "md" ? `<!-- ${MANAGED_BEGIN} -->` : `/* ${MANAGED_BEGIN} */`;
  const end = comment === "md" ? `<!-- ${MANAGED_END} -->` : `/* ${MANAGED_END} */`;
  const wrapped = `${begin}\n${blockBody.trim()}\n${end}\n`;
  if (!existing || existing.trim() === "") {
    return { content: wrapped, changed: true, action: "created" };
  }
  const beginIdx = existing.indexOf(begin);
  const endIdx = existing.indexOf(end);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    const separator = existing.endsWith("\n") ? "" : "\n";
    return { content: `${existing}${separator}\n${wrapped}`, changed: true, action: "updated" };
  }
  const next = `${existing.slice(0, beginIdx)}${wrapped}${existing.slice(endIdx + end.length).replace(/^\r?\n/, "")}`;
  if (next === existing) return { content: existing, changed: false, action: "unchanged" };
  return { content: next, changed: true, action: "updated" };
}

export function stripManagedBlock(existing: string, comment: "md" | "jsonc" = "md"): string {
  const begin = comment === "md" ? `<!-- ${MANAGED_BEGIN} -->` : `/* ${MANAGED_BEGIN} */`;
  const end = comment === "md" ? `<!-- ${MANAGED_END} -->` : `/* ${MANAGED_END} */`;
  const beginIdx = existing.indexOf(begin);
  const endIdx = existing.indexOf(end);
  if (beginIdx === -1 || endIdx === -1) return existing;
  return `${existing.slice(0, beginIdx)}${existing.slice(endIdx + end.length)}`.replace(/\n{3,}/g, "\n\n");
}

export function mergeJsonObject(
  existingRaw: string | null,
  managed: Record<string, unknown>,
  managedKey: string,
): { content: string; changed: boolean; preservedKeys: string[] } {
  const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
  const preservedKeys = Object.keys(existing).filter((key) => key !== managedKey);
  const next = { ...existing, [managedKey]: managed };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  const current = existingRaw ? `${existingRaw.endsWith("\n") ? existingRaw : `${existingRaw}\n`}` : "";
  return { content, changed: content !== current, preservedKeys };
}

export function mergeNamedRecord(
  existingRaw: string | null,
  recordKey: string,
  name: string,
  value: unknown,
): { content: string; changed: boolean } {
  const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
  const bucket = (existing[recordKey] as Record<string, unknown> | undefined) ?? {};
  const nextBucket = { ...bucket, [name]: value };
  const next = { ...existing, [recordKey]: nextBucket };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  return { content, changed: content !== (existingRaw ?? "") };
}

export function removeNamedRecord(existingRaw: string, recordKey: string, name: string): string {
  const existing = JSON.parse(existingRaw) as Record<string, unknown>;
  const bucket = { ...((existing[recordKey] as Record<string, unknown> | undefined) ?? {}) };
  delete bucket[name];
  const next = { ...existing, [recordKey]: bucket };
  return `${JSON.stringify(next, null, 2)}\n`;
}
