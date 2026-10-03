---
name: security-review
description: Adapta la skill existente security-compliance para auditar un cambio o el repo completo sin modificar código, y normaliza el reporte para gates. Use when the user invokes /security-review, asks for a security audit of current changes, or needs a security gate for a work item.
disable-model-invocation: true
---

# /security-review `<id>` [--changes|--full]

## Regla dura

**Esta fase no modifica código, tests ni configuración funcional.** Si el working tree cambia, registrá violación y bloqueá readiness.

## Cómo invocar la skill existente

No reconstruyas el auditor. Usá `security-compliance`:

| Kit | Skill existente |
|---|---|
| `--changes` (default) | `/security-compliance diff` o `sc.py diff --project .` |
| `--full` | `/security-compliance audit` |
| commit-range | `diff --base <sha>` si la skill lo permite |

Delante delimitá el alcance (archivos del change, Work Item, fingerprint) **sin editar el core de la skill**.

## Después del runner

1. Verificá working tree antes/después (`git status --porcelain`).
2. Normalizá con `team-ai security-normalize` o `security-review`. Si el JSON es ilegible/incompleto → **FAIL**, nunca PASS por «no se encontraron findings».
3. Preservá el documento original; el JSON del kit es derivado.
4. Guardá `.ai/security/<org-project-id>/<repo-id>/review-NNN.md|json` y `latest.json` (puntero, no reemplaza historial).
5. Atribución INTRODUCED requiere comparación con base; si no, `UNKNOWN` y REVIEW.
6. No afirmes certificación ISO/SOX. Conservá mappings de la skill; no inventes controles.

Política default: CRITICAL/HIGH introducidos bloquean; MEDIUM revisión; LOW/INFO informativo. Excepción: persona, justificación, alcance, expiración, evidencia. El LLM no autoaprueba.
