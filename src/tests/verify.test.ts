import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
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
  } finally {
    cleanup(repo);
  }
});
