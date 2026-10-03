export const MCP_SERVER_NAME = "ado-developer";
export const AZURE_MCP_PACKAGE = "@azure-devops/mcp";
export const AZURE_MCP_PINNED = "@azure-devops/mcp@1.4.0";

export const DEVELOPER_DOMAINS = ["core", "work", "work-items", "repositories"] as const;

export const WRITE_TOOLS = [
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
] as const;

export const READ_TOOLS = [
  "mcp_ado_core_list_projects",
  "mcp_ado_core_list_project_teams",
  "mcp_ado_core_get_identity_ids",
  "work.list_iterations",
  "work.list_team_iterations",
  "work.get_team_settings",
  "wit_work_item.get",
  "wit_work_item.get_batch",
  "wit_work_item.list_comments",
  "wit_work_item.list_revisions",
  "wit_work_item.my",
  "wit_work_item.list_for_iteration",
  "wit_work_item.get_type",
  "wit_work_item_attachment",
  "wit_query.get",
  "wit_query.get_results",
  "wit_query.wiql",
  "repo_repository.get",
  "repo_repository.list",
  "repo_pull_request.get",
  "repo_pull_request.list",
  "repo_pull_request.list_by_commits",
  "repo_branch.get",
  "repo_branch.list",
  "repo_file.get_content",
  "repo_file.list_directory",
  "repo_search_commits",
] as const;

export const CONCEPTUAL_TOOL_MAP = {
  get_work_item: "wit_work_item.get",
  get_parent: "wit_work_item.get + relations Hierarchy-Reverse / System.Parent",
  get_children: "wit_work_item.get + relations Hierarchy-Forward",
  get_comments: "wit_work_item.list_comments",
  get_attachments: "wit_work_item.get relations + wit_work_item_attachment",
  get_iteration: "work.list_iterations / wit_work_item.list_for_iteration",
  get_pr_links: "work item relations ArtifactLink / repo_pull_request.get",
} as const;

export function isWriteTool(toolName: string): boolean {
  const lowered = toolName.toLowerCase();
  return WRITE_TOOLS.some((name) => lowered === name.toLowerCase() || lowered.includes(name.toLowerCase()));
}

export function azureStdioArgs(organization: string): string[] {
  return [
    "-y",
    AZURE_MCP_PINNED,
    organization,
    "--authentication",
    "azcli",
    "-d",
    ...DEVELOPER_DOMAINS,
  ];
}

export function cursorMcpServer(organization: string): Record<string, unknown> {
  return {
    type: "stdio",
    command: "npx",
    args: azureStdioArgs(organization.includes("$") ? organization : organization),
  };
}

export function claudeMcpServer(organization: string): Record<string, unknown> {
  return {
    command: "npx",
    args: azureStdioArgs(organization),
  };
}
