# Guía breve del developer

Flujo diario (mismo en Claude Code y Cursor). Los slash del kit son skills del proyecto (`.cursor/skills` / `.claude/skills`). OpenSpec usa **otra** sintaxis.

## 1. Contexto

`/work-item 3215` lee la tarea en Azure **con el mismo PAT que tl-control**. El CLI hace GET (texto, comentarios, adjuntos e imágenes) y crea `feature/<id>-<slug>` desde `sandbox`. El agente no abre el `.env` ni pega el token. Sin PAT queda `BLOCKED`.

El CLI busca `AZURE_DEVOPS_EXT_PAT` o `AZURE_DEVOPS_PAT` en este orden: variable de entorno, `.env` del repo de producto, `.env` del kit, `.env` de `tl-control`. Nunca en Git ni en el chat. MCP `ado-developer` es opcional.

## 2. Plan

`/work-propose 3215` revisa el código actual contra la definición de la tarea y llama `/opsx:propose` (Claude) o `/opsx-propose` (Cursor). Guarda `plan-approval.json` de esa versión. Correr `/work-apply` aprueba implementarla. Si el resultado no cierra, se itera y se vuelve a proponer.

## 3. Código

`/work-apply 3215` → `/opsx:apply` o `/opsx-apply`. No inventes SP. No pises cambios ajenos.

## 4. Gates

`/verify-change 3215`  
`/security-review 3215 --changes` (skill **security-compliance**, no modifica código)

## 5. Commit y PR

`/commit-change 3215 --preview` luego `/commit-change 3215`. No hay push.  
`/pr-ready 3215` exporta `work-result-<repo>.json`. El PR se crea solo si lo pedís.

Scripts determinísticos: el CLI está en `source.corePath` de `.ai/kit-manifest.json` (`node "<corePath>/dist/cli.js" work-item|doctor|verify|fingerprint|pr-ready`). No uses `npx team-ai`.
