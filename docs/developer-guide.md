# Guía breve del developer

Flujo diario (mismo en Claude Code y Cursor). Los slash del kit son skills del proyecto (`.cursor/skills` / `.claude/skills`). OpenSpec usa **otra** sintaxis.

## 1. Contexto

`/work-item 3215` crea la rama local `feature/<id>-<slug>` desde `sandbox`.

Si el TL exportó `work-context.json`, pasalo. Si no, el kit arma contexto desde Azure (perfil lectura) y marca CONFIRMED/INFERRED/UNKNOWN.

## 2. Plan

`/work-propose 3215` → el agente llama `/opsx:propose` (Claude) o `/opsx-propose` (Cursor). Revisá `openspec/changes/wi-3215-*/`. Aprobá esa versión (contextHash + planHash).

## 3. Código

`/work-apply 3215` → `/opsx:apply` o `/opsx-apply`. No inventes SP. No pises cambios ajenos.

## 4. Gates

`/verify-change 3215`  
`/security-review 3215 --changes` (skill **security-compliance**, no modifica código)

## 5. Commit y PR

`/commit-change 3215 --preview` luego `/commit-change 3215`. No hay push.  
`/pr-ready 3215` exporta `work-result-<repo>.json`. El PR se crea solo si lo pedís.

Scripts determinísticos: `node dist/cli.js doctor|verify|fingerprint|pr-ready`.
