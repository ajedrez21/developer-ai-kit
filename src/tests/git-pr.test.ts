import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { previewCommit } from "../commit.js";
import { evaluatePrReady } from "../pr-ready.js";
import { sampleWorkContext } from "../contracts.js";
import { cleanup, git, initUserRepo } from "./helpers.js";

test("commit no incluye staging ajeno y no hace push", () => {
  const repo = initUserRepo();
  try {
    writeFileSync(join(repo, "owned.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "foreign.ts"), "export const b = 2;\n");
    git(repo, ["add", "foreign.ts"]);
    const preview = previewCommit({
      target: repo,
      ctx: sampleWorkContext(),
      ownedFiles: ["owned.ts"],
      messageSummary: "feat(customers): add status filter",
      bullets: ["add filter"],
    });
    assert.equal(preview.allowed, false);
    assert.ok(preview.blockedReasons.some((reason) => /Staging ajeno/.test(reason)));
    assert.match(preview.message, /#3215/);
  } finally {
    cleanup(repo);
  }
});

test("pr-ready bloquea con gates stale o fallidos", () => {
  const repo = initUserRepo();
  try {
    git(repo, ["checkout", "-b", "feature/3215-customer-status-filter"]);
    const evaluated = evaluatePrReady(repo, {
      ctx: sampleWorkContext(),
      changeId: "wi-3215-customer-status-filter",
      repoId: "shop-api",
      verification: { status: "FAIL", checkedFingerprint: "old", reportRef: "v", checkedAt: "t" },
      security: { status: "STALE", checkedFingerprint: "old", reportRef: "s", checkedAt: "t" },
    });
    assert.equal(evaluated.status, "BLOCKED");
    assert.ok(evaluated.reasons.length > 0);
  } finally {
    cleanup(repo);
  }
});
