import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inferCommitSummary, previewCommit } from "../commit.js";
import { evaluatePrReady, gatherReadinessInput } from "../pr-ready.js";
import { sampleWorkContext } from "../contracts.js";
import { computeFingerprint } from "../fingerprint.js";
import { saveLocalContext, workItemDir } from "../work-context.js";
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
    assert.match(inferCommitSummary(sampleWorkContext(), ["src/customers/search.ts"]), /feat\(customers\): filtrar clientes por estado/i);
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

test("pr-ready carga verify, security y commits del disco", () => {
  const repo = initUserRepo();
  try {
    git(repo, ["checkout", "-b", "feature/3215-customer-status-filter"]);
    writeFileSync(join(repo, "owned.ts"), "export const a = 1;\n");
    git(repo, ["add", "owned.ts"]);
    git(repo, ["commit", "-m", "feat(customers): add status filter #3215"]);
    const ctx = sampleWorkContext();
    saveLocalContext(repo, ctx);
    const fp = computeFingerprint(repo, { scopePaths: ctx.scope.included }).codeFingerprint;
    const dir = workItemDir(repo, ctx.workItem.organization, ctx.workItem.project, ctx.workItem.id);
    writeFileSync(
      join(dir, "verify-report.json"),
      `${JSON.stringify({ status: "PASS", checkedFingerprint: fp, generatedAt: "2026-10-31T00:00:00Z" }, null, 2)}\n`,
    );
    const secDir = join(repo, ".ai", "security", "contoso-shop-3215", "shop-api");
    mkdirSync(secDir, { recursive: true });
    writeFileSync(
      join(secDir, "review-001.json"),
      `${JSON.stringify({ result: "PASS", checkedFingerprint: fp, generatedAt: "2026-10-31T00:00:00Z" }, null, 2)}\n`,
    );
    writeFileSync(
      join(secDir, "latest.json"),
      `${JSON.stringify({ json: "review-001.json", result: "PASS" }, null, 2)}\n`,
    );
    const gathered = gatherReadinessInput(repo, {
      ctx,
      changeId: "wi-3215-customer-status-filter",
      repoId: "shop-api",
    });
    assert.equal(gathered.verification?.status, "PASS");
    assert.equal(gathered.security?.status, "PASS");
    assert.ok((gathered.commits ?? []).some((commit) => /#3215/.test(commit.message)));
    const evaluated = evaluatePrReady(repo, gathered);
    assert.equal(evaluated.status, "READY", evaluated.reasons.join("; "));
  } finally {
    cleanup(repo);
  }
});
