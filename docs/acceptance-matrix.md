# Matriz de aceptación KIT-AC01–KIT-AC24

Versión del kit: **1.0.0**. Fecha: 2026-10-03.

| ID | Resultado | Evidencia | Pendiente |
|---|---|---|---|
| KIT-AC01 | PASS (tests) | `setup.test.ts` dry-run + 2ª instalación sin `created` | — |
| KIT-AC02 | PASS (tests) | uninstall conserva CLAUDE.md usuario, sonar MCP, hook user | — |
| KIT-AC03 | PASS estructural | Setup genera las mismas skills en `.claude/skills` y `.cursor/skills` desde `skills/` | Validación de runtime en ambos hosts |
| KIT-AC04 | PASS parcial | Doctor lista CLI OpenSpec, `/opsx:propose` vs `/opsx-propose`, verify ausente | OpenSpec real en el repo de producto |
| KIT-AC05 | PASS con limitation | Denylist + `mcp-guard.cjs`; doctor no declara restricted sin hook | Auth Azure real / 403 |
| KIT-AC06 | PASS (tests) | Fixture TL CONFIRMED vs INFERRED; Azure-only marca gaps | MCP Azure live |
| KIT-AC07 | PASS (tests) | `approvalStillValid` false si cambia contextHash | — |
| KIT-AC08 | PASS (tests) | SP UNKNOWN bloquea | — |
| KIT-AC09 | PASS parcial | Skills + commit bloquear staging ajeno | Apply nativo OpenSpec en host |
| KIT-AC10 | PASS (tests) | verify extra.ts + criterios unknown | — |
| KIT-AC11 | PASS (tests) | script `test` ausente ≠ PASS | — |
| KIT-AC12 | PASS estructural | Adaptador invoca `sc.py`; treeUnchanged; skill no se copia | Ejecución real de security-compliance |
| KIT-AC13 | PASS (tests) | ilegible.md FAIL; introduced vs preexisting | — |
| KIT-AC14 | PASS estructural | Skill security-fix no autocertifica | Loop host |
| KIT-AC15 | PASS (tests) | HIGH introduced → FAIL; excepción sin responsable inválida | — |
| KIT-AC16 | PASS (tests) | untracked/staged cambian fingerprint | Hook format-on-commit en repo real |
| KIT-AC17 | PASS (tests) | preview bloquea foreign; mensaje `#3215`; CLI commit no pushea | — |
| KIT-AC18 | PASS documental | Fingerprint de contenido; pre-push STALE | Hook de formato real |
| KIT-AC19 | PASS (tests) | pr-ready BLOCKED con verify FAIL | — |
| KIT-AC20 | PASS (tests) | schemas + artifactId por repo | Consumo en dashboard TL (tarea 1) |
| KIT-AC21 | PASS documental | `ci/azure-pipelines-team-ai.yml` marca LLM NOT_RUN | Branch policies en ADO |
| KIT-AC22 | PASS | Node + `.cjs`; tests en Windows | Linux CI del kit |
| KIT-AC23 | PASS estructural | `.ai/.gitignore`; doctor no imprime tokens | Revisión humana de logs |
| KIT-AC24 | PASS (tests) | import TL sin dashboard | Round-trip con repo TL |

E2E host (work-item→…→export): **NOT_RUN** hasta tener Claude Code y Cursor con MCP autenticado. No se afirma portabilidad de host sólo porque hay dos carpetas de skills.
