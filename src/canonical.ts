import { sha256Hex } from "./hash.js";

/**
 * JSON Canonicalization Scheme (RFC 8785 / JCS).
 * Artefactos del kit usan tipos JSON simples; los números se serializan
 * con el algoritmo NumberToString de ECMAScript para enteros y valores finitos.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export function hashExcluding(value: Record<string, unknown>, excludeKeys: string[]): string {
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!excludeKeys.includes(key)) copy[key] = entry;
  }
  return sha256Hex(canonicalize(copy));
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return serializeNumber(value);
  if (typeof value === "string") return serializeString(value);
  if (typeof value === "bigint") {
    throw new Error("RFC 8785 no admite bigint");
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    if (value instanceof Date) {
      throw new Error("RFC 8785 no admite Date; usar string ISO 8601");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareUtf16);
    const parts = keys
      .filter((key) => record[key] !== undefined)
      .map((key) => `${serializeString(key)}:${serialize(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new Error(`Tipo no serializable en JCS: ${typeof value}`);
}

function compareUtf16(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("RFC 8785 no admite NaN ni Infinity");
  }
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

function serializeString(value: string): string {
  return JSON.stringify(value);
}
