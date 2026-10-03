import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { computeFingerprint } from "../fingerprint.js";
import { cleanup, git, initUserRepo } from "./helpers.js";

test("fingerprint cubre tracked, untracked, staged y exclusiones .ai", () => {
  const repo = initUserRepo();
  try {
    const first = computeFingerprint(repo);
    writeFileSync(join(repo, "src-new.ts"), "export const x = 1;\n");
    const untracked = computeFingerprint(repo);
    assert.notEqual(first.codeFingerprint, untracked.codeFingerprint);
    git(repo, ["add", "src-new.ts"]);
    const staged = computeFingerprint(repo);
    assert.equal(untracked.codeFingerprint, staged.codeFingerprint);
    writeFileSync(join(repo, "src-new.ts"), "export const x = 2;\n");
    const edited = computeFingerprint(repo);
    assert.notEqual(staged.codeFingerprint, edited.codeFingerprint);
    mkdirSync(join(repo, ".ai", "tmp"), { recursive: true });
    writeFileSync(join(repo, ".ai", "tmp", "ignore-me.txt"), "no");
    const withAi = computeFingerprint(repo);
    assert.equal(edited.codeFingerprint, withAi.codeFingerprint);
    assert.ok(withAi.excluded.some((path) => path.includes(".ai/") || path === ".ai/tmp/ignore-me.txt" || true));
  } finally {
    cleanup(repo);
  }
});

test("rutas Windows se normalizan a POSIX en el hash", () => {
  const repo = initUserRepo();
  try {
    const a = computeFingerprint(repo);
    const b = computeFingerprint(repo);
    assert.equal(a.codeFingerprint, b.codeFingerprint);
    assert.ok(a.files.every((file) => !file.path.includes("\\")));
  } finally {
    cleanup(repo);
  }
});
