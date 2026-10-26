import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { AZURE_PAT_MISSING, azurePat } from "./azure-env.js";
import type { BranchKind } from "./git.js";
import { posixPath } from "./kit-root.js";

const API = "7.1";
const GUID = "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})";
const ATTACHMENT_RE = new RegExp(
  `https://dev\\.azure\\.com/[^"'\\s>]+/_apis/wit/attachments/${GUID}(?:\\?[^"'\\s>]*)?`,
  "gi",
);
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export interface AzureHttp {
  getText(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  getBytes(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; body: Buffer; contentType: string | null }>;
}

export interface FetchedAttachment {
  guid: string;
  fileName: string;
  relPath: string;
  isImage: boolean;
}

export interface FetchedWorkItem {
  organization: string;
  project: string;
  id: number;
  revision: number;
  url: string;
  title: string;
  description: string;
  acceptance: string[];
  workItemType: string;
  assignedTo: string | null;
  parent: { id: number; revision: number; url: string } | null;
  comments: string[];
  attachments: FetchedAttachment[];
}

export function authHeader(pat: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}` };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractAcceptance(html: string): string[] {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => htmlToText(match[1]));
  if (items.length) return items.filter(Boolean);
  return htmlToText(html)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export function attachmentGuidsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(ATTACHMENT_RE)) {
    if (match[1]) ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

export function branchKindFromWorkItemType(type: string): BranchKind {
  return type.trim().toLowerCase() === "bug" ? "fix" : "feature";
}

export const defaultAzureHttp: AzureHttp = {
  async getText(url, headers) {
    const res = await fetch(url, { headers });
    return { status: res.status, body: await res.text() };
  },
  async getBytes(url, headers) {
    const res = await fetch(url, { headers: { ...headers, Accept: "application/octet-stream" } });
    return {
      status: res.status,
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type"),
    };
  },
};

function baseUrl(organization: string, project: string): string {
  return `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis`;
}

function fieldString(fields: Record<string, unknown>, name: string): string {
  const value = fields[name];
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "displayName" in value) {
    return String((value as { displayName?: string }).displayName ?? "");
  }
  return "";
}

function identityUrl(organization: string, project: string, id: number): string {
  return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${id}`;
}

function safeFileName(name: string, guid: string): string {
  const base = basename(name || guid).replace(/[^\w.\-]+/g, "_");
  return base && base !== "." && base !== ".." ? base : `${guid}.bin`;
}

export async function fetchAzureWorkItem(input: {
  organization: string;
  project: string;
  id: number;
  target: string;
  outDir: string;
  http?: AzureHttp;
  pat?: string;
}): Promise<FetchedWorkItem> {
  const pat = input.pat ?? azurePat(input.target);
  if (!pat) throw new Error(AZURE_PAT_MISSING);
  const http = input.http ?? defaultAzureHttp;
  const headers = authHeader(pat);
  const base = baseUrl(input.organization, input.project);
  const item = await getJson(
    http,
    `${base}/wit/workitems/${input.id}?$expand=all&api-version=${API}`,
    headers,
    `Work Item ${input.id}`,
  );
  const fields = (item.fields ?? {}) as Record<string, unknown>;
  const descriptionHtml = fieldString(fields, "System.Description");
  const acceptanceHtml = fieldString(fields, "Microsoft.VSTS.Common.AcceptanceCriteria");
  const commentsJson = await getJsonOptional(
    http,
    `${base}/wit/workItems/${input.id}/comments?api-version=${API}-preview.4`,
    headers,
  );
  const commentHtmls = ((commentsJson?.comments as Array<{ text?: string }> | undefined) ?? [])
    .map((comment) => comment.text ?? "")
    .filter(Boolean);
  const attachments = await downloadAttachments({
    http,
    headers,
    organization: input.organization,
    project: input.project,
    item,
    htmls: [descriptionHtml, acceptanceHtml, ...commentHtmls],
    outDir: input.outDir,
  });
  const parentId = Number(fields["System.Parent"] ?? 0);
  let parent: FetchedWorkItem["parent"] = null;
  if (Number.isFinite(parentId) && parentId > 0) {
    const parentItem = await getJsonOptional(
      http,
      `${base}/wit/workitems/${parentId}?$expand=none&api-version=${API}`,
      headers,
    );
    if (parentItem) {
      parent = {
        id: parentId,
        revision: Number(parentItem.rev ?? 1),
        url: identityUrl(input.organization, input.project, parentId),
      };
    }
  }
  return {
    organization: input.organization,
    project: input.project,
    id: input.id,
    revision: Number(item.rev ?? 1),
    url: typeof item.url === "string" ? item.url : identityUrl(input.organization, input.project, input.id),
    title: fieldString(fields, "System.Title"),
    description: htmlToText(descriptionHtml),
    acceptance: acceptanceHtml ? extractAcceptance(acceptanceHtml) : [],
    workItemType: fieldString(fields, "System.WorkItemType") || "Task",
    assignedTo: fieldString(fields, "System.AssignedTo") || null,
    parent,
    comments: commentHtmls.map(htmlToText),
    attachments,
  };
}

async function getJson(
  http: AzureHttp,
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<Record<string, unknown>> {
  const res = await http.getText(url, headers);
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label}: Azure rechazó el PAT (${res.status}). No se muestra el token.`);
  }
  if (res.status >= 400) throw new Error(`${label}: Azure GET ${res.status}.`);
  return JSON.parse(res.body) as Record<string, unknown>;
}

async function getJsonOptional(
  http: AzureHttp,
  url: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const res = await http.getText(url, headers);
  if (res.status >= 400) return null;
  return JSON.parse(res.body) as Record<string, unknown>;
}

async function downloadAttachments(input: {
  http: AzureHttp;
  headers: Record<string, string>;
  organization: string;
  project: string;
  item: Record<string, unknown>;
  htmls: string[];
  outDir: string;
}): Promise<FetchedAttachment[]> {
  const found = new Map<string, string>();
  const relations = (input.item.relations as Array<{ rel?: string; url?: string; attributes?: { name?: string } }> | undefined) ?? [];
  for (const rel of relations) {
    if (rel.rel !== "AttachedFile" || !rel.url) continue;
    const guid = rel.url.match(new RegExp(GUID, "i"))?.[1];
    if (!guid) continue;
    found.set(guid.toLowerCase(), rel.attributes?.name ?? `${guid}.bin`);
  }
  for (const html of input.htmls) {
    for (const guid of attachmentGuidsFromHtml(html)) {
      if (!found.has(guid)) found.set(guid, `${guid}.bin`);
    }
  }
  if (!found.size) return [];
  mkdirSync(input.outDir, { recursive: true });
  const saved: FetchedAttachment[] = [];
  for (const [guid, name] of found) {
    const fileName = safeFileName(name, guid);
    const url = `https://dev.azure.com/${encodeURIComponent(input.organization)}/${encodeURIComponent(input.project)}/_apis/wit/attachments/${guid}?download=true&api-version=${API}`;
    const res = await input.http.getBytes(url, input.headers);
    if (res.status >= 400 || res.body.length === 0) continue;
    if (res.contentType && /html|json|xml/i.test(res.contentType)) continue;
    const abs = join(input.outDir, fileName);
    writeFileSync(abs, res.body);
    saved.push({
      guid,
      fileName,
      relPath: posixPath(`attachments/${fileName}`),
      isImage: IMAGE_EXT.test(fileName),
    });
  }
  return saved;
}
