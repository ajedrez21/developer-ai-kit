import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findKitRoot } from "../kit-root.js";
import { exceptionValid, normalizeSecurityOutput } from "../security.js";
import { isWriteTool } from "../mcp.js";

test("reporte ilegible no da PASS", () => {
  const raw = readFileSync(join(findKitRoot(), "tests", "fixtures", "security", "illegible.md"), "utf8");
  const report = normalizeSecurityOutput(
    { kind: "markdown", raw, path: null },
    {
      workItemId: 1,
      repoId: "shop-api",
      mode: "changes",
      contextHash: "a",
      fingerprint: "b",
      skillPath: null,
      skillVersion: "1.0.0",
      treeUnchanged: true,
      base: "HEAD",
    },
  );
  assert.equal(report.result, "FAIL");
});

test("distingue finding introducido vs deuda previa y bloquea HIGH introducido", () => {
  const raw = readFileSync(join(findKitRoot(), "tests", "fixtures", "security", "failed.json"), "utf8");
  const report = normalizeSecurityOutput(
    { kind: "json", raw, path: null },
    {
      workItemId: 3215,
      repoId: "shop-api",
      mode: "changes",
      contextHash: "a",
      fingerprint: "b",
      skillPath: "C:/skills/security-compliance",
      skillVersion: "1.0.0",
      treeUnchanged: true,
      base: "main",
    },
  );
  const introduced = report.findings.find((item) => item.id === "F-aaaaaaaaaaaa");
  const preexisting = report.findings.find((item) => item.id === "F-bbbbbbbbbbbb");
  assert.equal(introduced?.origin, "INTRODUCED");
  assert.equal(preexisting?.origin, "PRE_EXISTING");
  assert.equal(report.result, "FAIL");
});

test("excepción vencida o sin responsable es inválida", () => {
  assert.equal(exceptionValid({ approvedBy: "tl", reason: "x", evidenceRef: "e", expiresAt: "2000-01-01T00:00:00Z" }), false);
  assert.equal(exceptionValid({ reason: "x", evidenceRef: "e", expiresAt: "2099-01-01T00:00:00Z" }), false);
});

test("MCP write tools se reconocen para el guard", () => {
  assert.equal(isWriteTool("wit_work_item_write"), true);
  assert.equal(isWriteTool("wit_work_item.get"), false);
});
