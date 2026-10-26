import assert from "node:assert/strict";
import test from "node:test";
import { canonicalize, hashExcluding } from "../canonical.js";
import { attachContextHash, sampleWorkContext, sampleWorkResult, validateWorkContext, validateWorkResult } from "../contracts.js";
import { azureWorkItemToContext, blockingContracts, contractBlocksImplementation, importTlContext } from "../work-context.js";
import { approvalStillValid } from "../work-context.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findKitRoot } from "../kit-root.js";

test("JCS ordena claves y es estable", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1}}');
});

test("contextHash excluye el propio campo", () => {
  const ctx = sampleWorkContext();
  const issues = validateWorkContext(ctx);
  assert.equal(issues.length, 0, JSON.stringify(issues));
  const again = hashExcluding(ctx as unknown as Record<string, unknown>, ["contextHash"]);
  assert.equal(ctx.contextHash, again);
});

test("work-result fixture valida", () => {
  const result = sampleWorkResult();
  assert.equal(validateWorkResult(result).length, 0);
});

test("contexto Azure-only queda READY sin paquete TL ni contrato inventado", () => {
  const ctx = azureWorkItemToContext({
    organization: "DMEDLATSYS",
    project: "NCSLite",
    id: 6646,
    revision: 3,
    url: "https://dev.azure.com/DMEDLATSYS/NCSLite/_workitems/edit/6646",
    title: "Filtrar clientes",
    description: "Agregar filtro por estado",
    acceptance: ["Filtra por estado"],
  });
  assert.equal(ctx.readiness.status, "READY");
  assert.equal(ctx.contracts.length, 0);
  assert.equal(ctx.gaps.length, 0);
  assert.equal(contractBlocksImplementation(ctx), false);
});

test("Azure con título y sin criterios formales es READY con gap no bloqueante", () => {
  const ctx = azureWorkItemToContext({
    organization: "contoso",
    project: "shop",
    id: 1,
    revision: 1,
    url: "https://dev.azure.com/contoso/shop/_workitems/edit/1",
    title: "Fix login",
    description: "",
    acceptance: [],
  });
  assert.equal(ctx.readiness.status, "READY");
  assert.equal(ctx.gaps.some((gap) => gap.blocking), false);
});

test("Azure sin título queda BLOCKED", () => {
  const ctx = azureWorkItemToContext({
    organization: "contoso",
    project: "shop",
    id: 1,
    revision: 1,
    url: "https://dev.azure.com/contoso/shop/_workitems/edit/1",
    title: "  ",
    description: "",
    acceptance: [],
  });
  assert.equal(ctx.readiness.status, "BLOCKED");
  assert.equal(ctx.gaps.some((gap) => gap.blocking), true);
});

test("paquete TL se importa y un SP UNKNOWN bloquea", () => {
  const fixturePath = join(findKitRoot(), "tests", "fixtures", "tl", "work-context.json");
  const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
  const hashed = attachContextHash({ ...raw, contextHash: "" });
  const { context } = importTlContext(hashed);
  assert.equal(context.artifactType, "work-context");
  const blocked = {
    ...context,
    contracts: context.contracts.map((c) => ({ ...c, status: "UNKNOWN" as const })),
  };
  assert.equal(contractBlocksImplementation(blocked), true);
  assert.ok(blockingContracts(blocked)[0].includes("SP-CUSTOMER-SEARCH"));
});

test("cambio de contextHash invalida aprobación", () => {
  assert.equal(
    approvalStillValid(
      { workItemId: 1, contextHash: "aaa", planHash: "p", changeId: "c", repoId: "r", baseSha: "b", approvedAt: "", approvedBy: "dev" },
      "bbb",
      "p",
    ),
    false,
  );
});
