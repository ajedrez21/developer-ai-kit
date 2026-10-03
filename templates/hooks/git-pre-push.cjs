#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const verifyMark = path.join(root, ".ai", "tmp", "latest-verify-fingerprint.txt");
const securityMark = path.join(root, ".ai", "tmp", "latest-security-fingerprint.txt");
const currentFile = path.join(root, ".ai", "tmp", "current-fingerprint.txt");

if (!fs.existsSync(currentFile)) {
  console.error("team-ai pre-push: sin fingerprint local. CI sigue siendo el enforcement de merge.");
  process.exit(0);
}
const current = fs.readFileSync(currentFile, "utf8").trim();
for (const [label, file] of [
  ["verify", verifyMark],
  ["security", securityMark],
]) {
  if (!fs.existsSync(file)) continue;
  const saved = fs.readFileSync(file, "utf8").trim();
  if (saved && current && saved !== current) {
    console.error(`team-ai pre-push: ${label} STALE frente al fingerprint actual. Reejecutar /verify-change y /security-review.`);
    process.exit(1);
  }
}
process.exit(0);
