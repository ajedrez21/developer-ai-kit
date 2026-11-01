import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyChange } from "../verify.js";
import { sampleWorkContext } from "../contracts.js";
import { saveLocalContext } from "../work-context.js";
import { cleanup, initUserRepo } from "./helpers.js";

test("verify detecta archivo extra y script ausente nunca es PASS", () => {
  const repo = initUserRepo();
  try {
    const ctx = sampleWorkContext();
    saveLocalContext(repo, ctx);
    mkdirSync(join(repo, "src", "customers"), { recursive: true });
    writeFileSync(join(repo, "src", "customers", "search.ts"), "export {}\n");
    writeFileSync(join(repo, "src", "extra.ts"), "export {}\n");
    const report = verifyChange({
      target: repo,
      workItemId: 3215,
      context: { ...ctx, workItem: { ...ctx.workItem, organization: "contoso", project: "shop" } },
      plannedFiles: ["src/customers/search.ts"],
      runner: {
        run: () => ({ code: 0, stdout: "ok", stderr: "" }),
      },
    });
    assert.ok(report.extraFiles.some((file) => file.path === "src/extra.ts"));
    assert.notEqual(report.status, "PASS");
    const missingTest = report.checks.find((check) => check.id === "test");
    assert.ok(missingTest);
    assert.notEqual(missingTest.status, "PASS");
    assert.equal(existsSync(join(repo, ".ai", "tmp", "latest-verify-fingerprint.txt")), true);
    assert.equal(readFileSync(join(repo, ".ai", "tmp", "current-fingerprint.txt"), "utf8").trim(), report.checkedFingerprint);
  } finally {
    cleanup(repo);
  }
});

test("verify ignora .security-compliance y toma previstos de OpenSpec", () => {
  const repo = initUserRepo();
  try {
    const ctx = {
      ...sampleWorkContext(),
      scope: { included: [], excluded: [], candidateFiles: [] },
    };
    saveLocalContext(repo, ctx);
    mkdirSync(join(repo, "src", "customers"), { recursive: true });
    writeFileSync(join(repo, "src", "customers", "search.ts"), "export {}\n");
    writeFileSync(join(repo, "src", "extra.ts"), "export {}\n");
    mkdirSync(join(repo, ".security-compliance", "reports"), { recursive: true });
    writeFileSync(join(repo, ".security-compliance", "reports", "run.json"), "{}\n");
    mkdirSync(join(repo, "openspec", "changes", "wi-3215-filter"), { recursive: true });
    writeFileSync(
      join(repo, "openspec", "changes", "wi-3215-filter", "tasks.md"),
      "- [x] Actualizar `src/customers/search.ts`\n",
    );
    const report = verifyChange({
      target: repo,
      workItemId: 3215,
      context: { ...ctx, workItem: { ...ctx.workItem, organization: "contoso", project: "shop" } },
      runner: { run: () => ({ code: 0, stdout: "ok", stderr: "" }) },
    });
    assert.deepEqual(report.plannedFiles, ["src/customers/search.ts"]);
    assert.ok(report.extraFiles.some((file) => file.path === "src/extra.ts"));
    assert.equal(report.extraFiles.some((file) => file.path.includes(".security-compliance")), false);
    assert.equal(report.touchedFiles.some((file) => file.includes(".security-compliance")), true);
  } finally {
    cleanup(repo);
  }
});
