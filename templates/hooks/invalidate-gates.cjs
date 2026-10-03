#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  const dir = path.join(process.cwd(), ".ai", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "gates-invalidated.json"),
    JSON.stringify({ at: new Date().toISOString(), reason: "code-edit", inputBytes: raw.length }, null, 2),
  );
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  process.exit(0);
});
