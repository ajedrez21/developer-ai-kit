import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setup, uninstall, update } from "../setup.js";
import { doctor } from "../doctor.js";
import { cleanup, initUserRepo } from "./helpers.js";

test("setup dry-run, idempotente, update y uninstall conservan al usuario", () => {
  const repo = initUserRepo();
  try {
    const dry = setup({ target: repo, role: "backend", hosts: ["claude", "cursor"], dryRun: true, organization: "contoso" });
    assert.ok(dry.actions.some((line) => line.startsWith("would ")));
    assert.equal(existsSync(join(repo, ".cursor", "skills", "work-item", "SKILL.md")), false);

    const first = setup({ target: repo, role: "backend", hosts: ["claude", "cursor"], organization: "contoso" });
    assert.ok(existsSync(join(repo, ".ai", "kit-manifest.json")));
    const claude = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    assert.match(claude, /reglas del usuario/);
    assert.match(claude, /TEAM-AI-KIT:BEGIN/);
    assert.match(claude, /CLI del kit:/);
    assert.match(claude, /node ".*dist\/cli\.js"/);
    assert.match(claude, /No uses `npx team-ai`/);
    const skill = readFileSync(join(repo, ".claude", "skills", "work-item", "SKILL.md"), "utf8");
    assert.doesNotMatch(skill, /<kit>/);
    assert.match(skill, /node ".*dist\/cli\.js"/);
    assert.doesNotMatch(skill, /--context path\/to\/work-context\.json/);
    assert.match(skill, /AZURE_DEVOPS_EXT_PAT/);
    assert.match(skill, /abre `\.env`/);
    assert.match(claude, /AZURE_DEVOPS_EXT_PAT/);
    const propose = readFileSync(join(repo, ".claude", "skills", "work-propose", "SKILL.md"), "utf8");
    assert.match(propose, /código y tests reales/);
    assert.doesNotMatch(propose, /Incorporá contexto TL/);
    const prReady = readFileSync(join(repo, ".claude", "skills", "pr-ready", "SKILL.md"), "utf8");
    assert.match(prReady, /node ".*dist\/cli\.js"/);
    const mcp = JSON.parse(readFileSync(join(repo, ".cursor", "mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers.sonar);
    assert.ok(mcp.mcpServers["ado-developer"]);
    assert.ok(mcp.mcpServers["ado-developer"].args.includes("@azure-devops/mcp@2.10.0"));
    const userHook = readFileSync(join(repo, ".git", "hooks", "pre-push"), "utf8");
    assert.match(userHook, /user-hook/);

    const second = setup({ target: repo, role: "backend", hosts: ["claude", "cursor"], organization: "contoso" });
    const createdTwice = second.actions.filter((line) => line.startsWith("created ")).length;
    assert.equal(createdTwice, 0);

    writeFileSync(join(repo, ".cursor", "rules", "user-only.mdc"), "mine\n");
    update({ target: repo, role: "backend", hosts: ["claude", "cursor"], organization: "contoso" });
    assert.equal(readFileSync(join(repo, ".cursor", "rules", "user-only.mdc"), "utf8"), "mine\n");

    const report = doctor(repo);
    assert.ok(report.checks.some((check) => check.id === "openspec"));
    assert.ok(report.checks.some((check) => check.id === "mcp-write-guard"));
    assert.equal(report.checks.find((check) => check.id === "cli-resolvable")?.ok, true);
    assert.equal(report.checks.find((check) => check.id === "mcp-pin")?.ok, true);
    assert.ok(report.checks.some((check) => check.id === "mcp-package"));

    uninstall(repo);
    const claudeAfter = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    assert.match(claudeAfter, /reglas del usuario/);
    assert.doesNotMatch(claudeAfter, /TEAM-AI-KIT:BEGIN/);
    const mcpAfter = JSON.parse(readFileSync(join(repo, ".cursor", "mcp.json"), "utf8"));
    assert.ok(mcpAfter.mcpServers.sonar);
    assert.equal(mcpAfter.mcpServers["ado-developer"], undefined);
    assert.ok(existsSync(join(repo, ".git", "hooks", "pre-push")));
    assert.ok(first.managedFiles.length > 0);
  } finally {
    cleanup(repo);
  }
});
