---
name: security-review
description: Adapta la skill existente security-compliance para auditar un cambio o el repo completo sin modificar código, y normaliza el reporte para gates. Use when the user invokes /security-review, asks for a security audit of current changes, or needs a security gate for a work item.
disable-model-invocation: true
---

# /security-review `<id>` [--changes|--full] [--base <ref>] [--review <file>]

`--id` es obligatorio. Sin un Work Item válido el comando aborta (no crea `local-local-NaN`).

## Regla dura

**Esta fase no modifica código, tests ni configuración funcional.** Si el working tree cambia, registrá violación y bloqueá readiness. Los reportes en `.security-compliance/` no cuentan como cambio de código.

## Cómo invocar la skill existente

No reconstruyas el auditor. Usá el CLI del kit (`security-review`), que llama a `security-compliance`:

| Kit | Skill existente |
|---|---|
| `--changes` (default) | `sc.py diff --project . --base <ref> --json` |
| `--full` | `sc.py audit --project . --json` |
| commit-range | `--base <sha>` |

`--base` acota el diff. Default: `HEAD` si hay cambios locales; si no, la `baseBranch` de la política (`sandbox`). Pasá `--base` explícito cuando el change ya está commiteado.

Si el agente produjo `review.json`, pasalo con `--review` para que entre al gate. Sin `--review` los controles asistidos quedan `NOT_RUN` y el resultado no puede ser PASS automático.

Delante delimitá el alcance (archivos del change, Work Item, fingerprint) **sin editar el core de la skill**.

## Después del runner

1. Verificá working tree antes/después (`git status --porcelain`).
2. Normalizá con `node "<kit>/dist/cli.js" security-normalize` o `node "<kit>/dist/cli.js" security-review`. Si esa ruta no existe, leé `source.corePath` de `.ai/kit-manifest.json`. Si el JSON es ilegible/incompleto → **FAIL**, nunca PASS por «no se encontraron findings».
3. Preservá el documento original; el JSON del kit es derivado.
4. Guardá `.ai/security/<org-project-id>/<repo-id>/review-NNN.md|json` y `latest.json` (puntero, no reemplaza historial).
5. Atribución INTRODUCED requiere comparación con base; si no, `UNKNOWN` y REVIEW.
6. No afirmes certificación ISO/SOX. Conservá mappings de la skill; no inventes controles.

Política default: CRITICAL/HIGH introducidos bloquean; MEDIUM revisión; LOW/INFO informativo. Excepción: persona, justificación, alcance, expiración, evidencia. El LLM no autoaprueba.
