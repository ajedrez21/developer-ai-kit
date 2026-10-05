import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureWorkItemBranch, workItemBranchName } from "../git.js";
import { DEFAULT_POLICY } from "../policy.js";
import { sampleWorkContext } from "../contracts.js";
import { cleanup, git, initUserRepo } from "./helpers.js";

test("work-item crea feature/<id>-<slug> desde sandbox", () => {
  const repo = initUserRepo();
  try {
    git(repo, ["checkout", "-b", "sandbox"]);
    const sandbox = git(repo, ["rev-parse", "HEAD"]).trim();
    const ctx = sampleWorkContext();
    const name = workItemBranchName(ctx.workItem.id, ctx.summary.functionalGoal);
    assert.equal(name, "feature/3215-filtrar-clientes-por-estado");
    assert.match(name, new RegExp(DEFAULT_POLICY.branchPattern));

    const created = ensureWorkItemBranch(repo, { branch: name, base: "sandbox", pattern: DEFAULT_POLICY.branchPattern });
    assert.equal(created.created, true);
    assert.equal(created.branch, name);
    assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), name);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).trim(), sandbox);

    const again = ensureWorkItemBranch(repo, { branch: name, base: "sandbox", pattern: DEFAULT_POLICY.branchPattern });
    assert.equal(again.created, false);
    assert.equal(git(repo, ["rev-parse", "HEAD"]).trim(), sandbox);
  } finally {
    cleanup(repo);
  }
});

test("no cambia de rama si el working tree está sucio", () => {
  const repo = initUserRepo();
  try {
    git(repo, ["checkout", "-b", "sandbox"]);
    writeFileSync(join(repo, "dirty.ts"), "export const x = 1;\n");
    assert.throws(
      () => ensureWorkItemBranch(repo, {
        branch: "feature/3215-filtrar-clientes-por-estado",
        base: "sandbox",
        pattern: DEFAULT_POLICY.branchPattern,
      }),
      /sin commitear/,
    );
    assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "sandbox");
  } finally {
    cleanup(repo);
  }
});

test("falla si no existe sandbox", () => {
  const repo = initUserRepo();
  try {
    assert.throws(
      () => ensureWorkItemBranch(repo, {
        branch: "feature/3215-task",
        base: "sandbox",
        pattern: DEFAULT_POLICY.branchPattern,
      }),
      /sandbox/,
    );
  } finally {
    cleanup(repo);
  }
});
