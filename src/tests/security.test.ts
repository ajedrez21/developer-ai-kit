import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findKitRoot } from "../kit-root.js";
import { exceptionValid, normalizeSecurityOutput, securityPythonEnv, securityReview } from "../security.js";
import { isWriteTool } from "../mcp.js";
import { cleanup, initUserRepo } from "./helpers.js";

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

test("scanners se serializan con tool/status/exit y UTF-8 forzado", () => {
  assert.equal(securityPythonEnv({}).PYTHONUTF8, "1");
  const report = normalizeSecurityOutput(
    {
      kind: "json",
      raw: JSON.stringify({
        command: "diff",
        gate: { status: "PASS" },
        snapshot: { scope: "changed_files" },
        findings: [],
        scanners: [
          { tool: "semgrep", status: "error", exit_code: 2 },
          { tool: "gitleaks", status: "missing" },
          { tool: "osv-scanner", status: "missing" },
        ],
        coverage: { by_status: { NOT_RUN: 2 } },
        controls: [{ id: "SEC-AUTH", method: "agent", status: "NOT_RUN" }],
      }),
      path: null,
    },
    {
      workItemId: 6710,
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
  assert.deepEqual(report.tools, ["semgrep:error:exit 2", "gitleaks:missing", "osv-scanner:missing"]);
  assert.equal(report.result, "REVIEW");
  assert.ok(report.limitations.some((line) => /Scanners sin cobertura/.test(line)));
  assert.ok(report.limitations.some((line) => /--review/.test(line)));
});

test("security-review exige id y persiste en org-project, no local-local-NaN", () => {
  const repo = initUserRepo();
  try {
    assert.throws(
      () =>
        securityReview({
          target: repo,
          workItemId: Number.NaN,
          repoId: "shop-api",
          mode: "changes",
        }),
      /Falta --id/,
    );
    const report = securityReview({
      target: repo,
      workItemId: 6710,
      repoId: "shop-api",
      organization: "contoso",
      project: "shop",
      mode: "changes",
    });
    assert.equal(report.result, "NOT_AVAILABLE");
    assert.equal(existsSync(join(repo, ".ai", "security", "contoso-shop-6710", "shop-api", "latest.json")), true);
    assert.equal(existsSync(join(repo, ".ai", "security", "local-local-NaN")), false);
    assert.equal(existsSync(join(repo, ".ai", "tmp", "latest-security-fingerprint.txt")), true);
  } finally {
    cleanup(repo);
  }
});
