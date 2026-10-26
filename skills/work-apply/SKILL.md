---
name: work-apply
description: Aplica un plan OpenSpec aprobado para un Work Item, aislando cambios ajenos y bloqueando SP/API sin contrato. Use when the user invokes /work-apply or asks to implement an approved OpenSpec change.
disable-model-invocation: true
---

# /work-apply `<id>`

## Precondiciones

- Hay un change OpenSpec para el id. Si falta `plan-approval.json`, armala con el plan actual (`contextHash`, `planHash`, repo, `baseSha`) y seguí. Invocar `/work-apply` aprueba esa versión.
- Si `plan-approval.json` existe y el `planHash` del change coincide, aplicalo. Si el plan en disco cambió, actualizá la aprobación a esa versión y aplicala.
- Si el contexto incluye contratos `stored-procedure` / `api-contract`, tienen que estar `CONFIRMED`. Si la tarea Azure no menciona SP/API, no inventes contratos ni bloquees por eso. No inventes firmas. Mocks sólo de contratos ya aprobados y marcados como mock.
- Capturá `git status --porcelain` **antes** de editar. No reviertas ni incluyas cambios staged/unstaged/untracked ajenos.

## Pasos

1. Invocá apply nativo: Claude `/opsx:apply`, Cursor `/opsx-apply` (ver `.ai/openspec-commands.json`).
2. Conservá arquitectura y convenciones del repo. Cargá `knowledge-backend` o `knowledge-frontend` sólo si aplica.
3. Actualizá checkboxes de `tasks.md` sólo con trabajo efectivamente hecho.
4. Correcciones chicas: aplicalas y registralas. Si el resultado no cierra, el developer itera el código y después actualiza el plan con `/work-propose`.
5. Al modificar código, invalidá verify/security previos (`.ai/tmp/gates-invalidated.json`).
6. Si el working tree ajeno impide verificación fiable, diagnosticá y proponé worktree aislado; no lo uses sin autorización.

No hay scheduler multi-repo. Cada repo tiene su changeId/branch/headSha.
