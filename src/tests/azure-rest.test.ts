import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AZURE_PAT_MISSING, parseEnvFile } from "../azure-env.js";
import {
  attachmentGuidsFromHtml,
  extractAcceptance,
  fetchAzureWorkItem,
  htmlToText,
  type AzureHttp,
} from "../azure-rest.js";
import { cleanup, tempDir } from "./helpers.js";

test("parseEnvFile lee AZURE_DEVOPS_EXT_PAT sin otras líneas rotas", () => {
  const dir = tempDir("env");
  try {
    const path = join(dir, ".env");
    writeFileSync(path, "# c\nAZURE_DEVOPS_EXT_PAT=abc123\nFOO=bar\n");
    const parsed = parseEnvFile(path);
    assert.equal(parsed.AZURE_DEVOPS_EXT_PAT, "abc123");
    assert.equal(parsed.FOO, "bar");
  } finally {
    cleanup(dir);
  }
});

test("htmlToText y criterios desde HTML Azure", () => {
  assert.equal(htmlToText("<p>Hola<br/>mundo</p>"), "Hola\nmundo");
  assert.deepEqual(extractAcceptance("<ul><li>Filtra por estado</li><li>POST</li></ul>"), [
    "Filtra por estado",
    "POST",
  ]);
  assert.deepEqual(
    attachmentGuidsFromHtml(
      `<img src="https://dev.azure.com/ORG/proj/_apis/wit/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?fileName=a.png">`,
    ),
    ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
  );
});

test("fetchAzureWorkItem mapea WI, comentarios e imagen; sin PAT falla", async () => {
  const dir = tempDir("azure-rest");
  try {
    const http: AzureHttp = {
      async getText(url) {
        if (url.includes("/comments")) {
          return { status: 200, body: JSON.stringify({ comments: [{ text: "<p>visto</p>" }] }) };
        }
        if (url.includes("/workitems/10")) {
          return {
            status: 200,
            body: JSON.stringify({
              rev: 2,
              url: "https://dev.azure.com/org/proj/_workitems/edit/10",
              fields: {
                "System.Title": "Filtrar",
                "System.Description":
                  '<p>Hola</p><img src="https://dev.azure.com/org/proj/_apis/wit/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa?fileName=a.png">',
                "Microsoft.VSTS.Common.AcceptanceCriteria": "<ul><li>Filtra</li></ul>",
                "System.WorkItemType": "Task",
              },
              relations: [
                {
                  rel: "AttachedFile",
                  url: "https://dev.azure.com/org/proj/_apis/wit/attachments/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                  attributes: { name: "a.png" },
                },
              ],
            }),
          };
        }
        return { status: 404, body: "{}" };
      },
      async getBytes() {
        return { status: 200, body: Buffer.from("png"), contentType: "image/png" };
      },
    };
    const fetched = await fetchAzureWorkItem({
      organization: "org",
      project: "proj",
      id: 10,
      target: dir,
      outDir: join(dir, "att"),
      http,
      pat: "secret-token",
    });
    assert.equal(fetched.title, "Filtrar");
    assert.equal(fetched.description, "Hola");
    assert.deepEqual(fetched.acceptance, ["Filtra"]);
    assert.equal(fetched.comments[0], "visto");
    assert.equal(fetched.attachments[0]?.fileName, "a.png");
    assert.equal(existsSync(join(dir, "att", "a.png")), true);

    await assert.rejects(
      () =>
        fetchAzureWorkItem({
          organization: "org",
          project: "proj",
          id: 10,
          target: dir,
          outDir: join(dir, "att2"),
          http,
          pat: "",
        }),
      (error: unknown) => error instanceof Error && error.message === AZURE_PAT_MISSING,
    );
  } finally {
    cleanup(dir);
  }
});
