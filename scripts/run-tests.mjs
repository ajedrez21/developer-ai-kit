import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = globSync("dist/tests/*.test.js");
if (!files.length) {
  console.error("No hay tests compilados en dist/tests");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", windowsHide: true });
process.exit(result.status ?? 1);
