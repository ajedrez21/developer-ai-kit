#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { analyzeProjectRules, writeAnalysis } from "./analyze-rules.js";
import { previewCommit, commitChange } from "./commit.js";
import { attachContextHash, sampleWorkContext, validateWorkContext, validateWorkResult } from "./contracts.js";
import { doctor } from "./doctor.js";
import { computeFingerprint } from "./fingerprint.js";
import { ensureWorkItemBranch, workItemBranchName, type BranchKind } from "./git.js";
import { loadManifest, loadPolicy } from "./policy.js";
import { KIT_VERSION } from "./kit-root.js";
import { evaluatePrReady, exportWorkResult, prBody, detectRepoId } from "./pr-ready.js";
import { setup, uninstall, update } from "./setup.js";
import { normalizeSecurityOutput, securityReview } from "./security.js";
import { verifyChange } from "./verify.js";
import { branchKindFromWorkItemType, fetchAzureWorkItem } from "./azure-rest.js";
import { azureWorkItemToContext, importTlContext, loadLocalContext, saveLocalContext, workItemDir } from "./work-context.js";
import type { Host, Role, WorkContext } from "./types.js";

function args(): { cmd: string; flags: Record<string, string | boolean>; rest: string[] } {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "help";
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const [key, raw] = token.slice(2).split("=");
      if (raw !== undefined) flags[key] = raw;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[i + 1];
        i += 1;
      } else flags[key] = true;
    } else rest.push(token);
  }
  return { cmd, flags, rest };
}

function targetOf(flags: Record<string, string | boolean>): string {
  return resolve(String(flags.target ?? flags.repo ?? process.cwd()));
}

function hostsOf(flags: Record<string, string | boolean>): Host[] {
  const raw = String(flags.hosts ?? "claude,cursor");
  return raw.split(",").map((item) => item.trim()).filter((item): item is Host => item === "claude" || item === "cursor");
}

async function main(): Promise<void> {
  const { cmd, flags, rest } = args();
  switch (cmd) {
    case "help":
    case "--help":
      console.log(helpText());
      return;
    case "version":
      console.log(KIT_VERSION);
      return;
    case "setup": {
      const report = setup({
        target: targetOf(flags),
        role: (String(flags.role ?? "shared") as Role),
        hosts: hostsOf(flags),
        organization: flags.org ? String(flags.org) : undefined,
        project: flags.project ? String(flags.project) : undefined,
        securitySkillPath: flags["security-skill"] ? String(flags["security-skill"]) : undefined,
        dryRun: Boolean(flags["dry-run"]),
      });
      printReport(report);
      return;
    }
    case "update": {
      const report = update({
        target: targetOf(flags),
        role: (String(flags.role ?? "shared") as Role),
        hosts: hostsOf(flags),
        version: flags.version ? String(flags.version) : undefined,
        dryRun: Boolean(flags["dry-run"]),
      });
      printReport(report);
      return;
    }
    case "uninstall": {
      printReport(uninstall(targetOf(flags), Boolean(flags["dry-run"])));
      return;
    }
    case "doctor": {
      const result = doctor(targetOf(flags));
      for (const check of result.checks) {
        console.log(`${check.ok ? "OK" : "!!"} [${check.level}] ${check.title}: ${check.detail}`);
      }
      console.log(result.summary);
      if (result.checks.some((check) => !check.ok && check.id !== "mcp-auth" && check.id !== "mcp-package" && check.id !== "azure-pat")) process.exitCode = 1;
      return;
    }
    case "fingerprint": {
      const fp = computeFingerprint(targetOf(flags), {
        scopePaths: flags.scope ? String(flags.scope).split(",") : undefined,
      });
      console.log(JSON.stringify(fp, null, 2));
      return;
    }
    case "analyze-rules": {
      const rules = analyzeProjectRules(targetOf(flags));
      const path = writeAnalysis(targetOf(flags), rules);
      console.log(path);
      return;
    }
    case "work-item": {
      await runWorkItem(flags, rest);
      return;
    }
    case "import-context": {
      const raw = JSON.parse(readFileSync(String(flags.file ?? rest[0]), "utf8"));
      const { context } = importTlContext(raw);
      saveLocalContext(targetOf(flags), context);
      console.log(context.contextHash);
      return;
    }
    case "verify": {
      const target = targetOf(flags);
      const identity = azureIdentityFrom(target, flags);
      const report = verifyChange({
        target,
        workItemId: Number(flags.id ?? rest[0]),
        organization: identity.organization,
        project: identity.project,
      });
      console.log(`${report.status} extras=${report.extraFiles.length} fingerprint=${report.checkedFingerprint}`);
      if (report.status === "FAIL" || report.status === "NOT_AVAILABLE") process.exitCode = 1;
      return;
    }
    case "security-normalize": {
      const raw = readFileSync(String(flags.file ?? rest[0]), "utf8");
      const kind = raw.trim().startsWith("{") ? "json" : "markdown";
      const report = normalizeSecurityOutput(
        { kind, raw, path: null },
        {
          workItemId: Number(flags.id ?? 0),
          repoId: String(flags.repoId ?? "repo"),
          mode: flags.full ? "full" : "changes",
          contextHash: String(flags.contextHash ?? ""),
          fingerprint: String(flags.fingerprint ?? ""),
          skillPath: null,
          skillVersion: null,
          treeUnchanged: true,
          base: "HEAD",
        },
      );
      console.log(JSON.stringify(report, null, 2));
      if (report.result === "FAIL" || report.result === "NOT_AVAILABLE") process.exitCode = 1;
      return;
    }
    case "security-review": {
      const report = securityReview({
        target: targetOf(flags),
        workItemId: Number(flags.id ?? rest[0]),
        repoId: detectRepoId(targetOf(flags)),
        mode: flags.full ? "full" : "changes",
        contextHash: String(flags.contextHash ?? ""),
        fingerprint: computeFingerprint(targetOf(flags)).codeFingerprint,
      });
      console.log(`${report.result} findings=${report.findings.length}`);
      return;
    }
    case "commit-preview":
    case "commit": {
      const target = targetOf(flags);
      const id = Number(flags.id ?? rest[0]);
      const identity = azureIdentityFrom(target, flags);
      const ctx =
        loadLocalContext(target, identity.organization, identity.project, id) ??
        sampleWorkContext();
      const owned = String(flags.files ?? "").split(",").filter(Boolean);
      const preview = previewCommit({
        target,
        ctx,
        ownedFiles: owned,
        messageSummary: String(flags.summary ?? `chore: update work item ${id}`),
        bullets: String(flags.bullets ?? "apply approved change").split("||"),
      });
      console.log(JSON.stringify(preview, null, 2));
      if (cmd === "commit" && flags.confirm) {
        const result = commitChange({ target, preview, confirm: true });
        console.log(result.sha);
      }
      return;
    }
    case "pr-ready": {
      const target = targetOf(flags);
      const id = Number(flags.id ?? rest[0]);
      const identity = azureIdentityFrom(target, flags);
      const ctx =
        loadLocalContext(target, identity.organization, identity.project, id) ??
        sampleWorkContext();
      const evaluated = evaluatePrReady(target, {
        ctx,
        changeId: String(flags.changeId ?? `wi-${id}`),
        repoId: detectRepoId(target),
      });
      const path = exportWorkResult(target, evaluated.result);
      console.log(JSON.stringify({ status: evaluated.status, reasons: evaluated.reasons, path, body: prBody(ctx, evaluated.result) }, null, 2));
      if (evaluated.status !== "READY") process.exitCode = 1;
      return;
    }
    case "export-result": {
      const file = String(flags.file ?? rest[0]);
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const issues = validateWorkResult(raw);
      if (issues.length) throw new Error(issues.map((issue) => `${issue.path} ${issue.message}`).join("; "));
      const path = exportWorkResult(targetOf(flags), raw);
      console.log(path);
      return;
    }
    case "validate-context": {
      const raw = JSON.parse(readFileSync(String(flags.file ?? rest[0]), "utf8"));
      const issues = validateWorkContext(raw);
      if (issues.length) {
        console.error(issues);
        process.exitCode = 1;
      } else console.log(attachContextHash({ ...raw, contextHash: "" }).contextHash);
      return;
    }
    default:
      console.error(`Comando desconocido: ${cmd}`);
      console.log(helpText());
      process.exitCode = 2;
  }
}

async function runWorkItem(flags: Record<string, string | boolean>, rest: string[]): Promise<void> {
  const id = Number(flags.id ?? rest[0]);
  if (!Number.isFinite(id)) throw new Error("Falta --id");
  const target = targetOf(flags);
  const identity = azureIdentityFrom(target, flags);
  let ctx: WorkContext;
  let inferredKind: BranchKind | undefined;
  if (flags.context) {
    const raw = JSON.parse(readFileSync(String(flags.context), "utf8"));
    ctx = importTlContext(raw).context;
  } else if (flags.title) {
    ctx = azureWorkItemToContext({
      organization: identity.organization,
      project: identity.project,
      id,
      revision: Number(flags.revision ?? 1),
      url: String(flags.url ?? `https://dev.azure.com/${identity.organization}/${identity.project}/_workitems/edit/${id}`),
      title: String(flags.title),
      description: String(flags.description ?? ""),
      acceptance: flags.acceptance ? String(flags.acceptance).split("||") : [],
    });
  } else {
    const dir = workItemDir(target, identity.organization, identity.project, id);
    const fetched = await fetchAzureWorkItem({
      organization: identity.organization,
      project: identity.project,
      id,
      target,
      outDir: join(dir, "attachments"),
    });
    inferredKind = branchKindFromWorkItemType(fetched.workItemType);
    ctx = azureWorkItemToContext({
      organization: fetched.organization,
      project: fetched.project,
      id: fetched.id,
      revision: fetched.revision,
      url: fetched.url,
      title: fetched.title,
      description: [fetched.description, ...fetched.comments].filter(Boolean).join("\n\n"),
      acceptance: fetched.acceptance,
      assignedTo: fetched.assignedTo,
      parent: fetched.parent,
      comments: fetched.comments,
      attachmentPaths: fetched.attachments.map((item) => item.relPath),
    });
  }
  const policy = loadPolicy(target);
  const kind = flags.kind ? branchKindOf(flags.kind) : (inferredKind ?? "feature");
  const branchName = workItemBranchName(ctx.workItem.id, ctx.summary.functionalGoal, kind);
  const branch =
    ctx.readiness.status === "BLOCKED"
      ? { branch: branchName, created: false, skipped: true, reason: "definición Azure ausente" }
      : ensureWorkItemBranch(target, {
          branch: branchName,
          base: String(flags.base ?? policy.baseBranch),
          pattern: policy.branchPattern,
        });
  const saved = saveLocalContext(target, ctx);
  console.log(JSON.stringify({ dir: saved, readiness: ctx.readiness, contextHash: ctx.contextHash, branch }, null, 2));
}

function azureIdentityFrom(target: string, flags: Record<string, string | boolean>): { organization: string; project: string } {
  const manifest = loadManifest(target);
  return {
    organization: String(flags.org ?? manifest?.azure.organization ?? "local"),
    project: String(flags.project ?? manifest?.azure.project ?? "local"),
  };
}

function branchKindOf(value: string | boolean | undefined): BranchKind {
  const kind = String(value ?? "feature");
  if (kind === "feature" || kind === "fix" || kind === "chore") return kind;
  throw new Error(`--kind debe ser feature, fix o chore. Recibido: ${kind}`);
}

function printReport(report: { actions: string[]; warnings: string[] }): void {
  for (const action of report.actions) console.log(action);
  for (const warning of report.warnings) console.warn(`WARN ${warning}`);
}

function helpText(): string {
  return `team-ai ${KIT_VERSION}
Comandos: setup | update | uninstall | doctor | fingerprint | analyze-rules
          work-item | import-context | verify | security-review | security-normalize
          commit-preview | commit | pr-ready | export-result | validate-context
Opciones comunes: --target DIR --role backend|frontend|shared --hosts claude,cursor --dry-run --id N
work-item lee Azure con PAT local (AZURE_DEVOPS_EXT_PAT), igual que tl-control.
`;
}

void mkdirSync;
void dirname;
void existsSync;
void writeFileSync;

try {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
