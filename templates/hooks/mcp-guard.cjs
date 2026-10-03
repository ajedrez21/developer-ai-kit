#!/usr/bin/env node
"use strict";

const WRITE_TOOLS = [
  "wit_work_item_write",
  "wit_work_item_comment_write",
  "wit_work_item_link_write",
  "wit_work_item_attachment_upload",
  "wit_work_item_attachment_link",
  "work_iteration_write",
  "work_capacity_write",
  "repo_pull_request_write",
  "repo_pull_request_thread_write",
  "repo_create_branch",
  "wiki_upsert_page",
  "pipelines_write",
  "testplan_test_plan_write",
  "testplan_test_suite_write",
  "testplan_test_case_write",
];

function isWriteTool(name) {
  const lowered = String(name || "").toLowerCase();
  return WRITE_TOOLS.some(
    (item) => lowered === item.toLowerCase() || lowered.includes(item.toLowerCase()) || lowered.includes("_write"),
  );
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  const tool = payload.tool_name || payload.toolName || payload.tool || payload.command || payload.mcpTool || payload.name || "";
  const server = payload.server || payload.mcp_server || payload.serverName || "";
  if (isWriteTool(`${server} ${tool}`)) {
    const message =
      "Team AI Kit: herramienta MCP de escritura bloqueada en perfil developer. No cambia estados, asignación, sprints ni crea PRs.";
    process.stdout.write(`${JSON.stringify({ permission: "deny", decision: "deny", reason: message, blocked: true, message })}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify({ permission: "allow", decision: "allow" })}\n`);
  process.exit(0);
});
