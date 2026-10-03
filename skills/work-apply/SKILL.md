---
name: work-apply
description: Aplica un plan OpenSpec aprobado para un Work Item, aislando cambios ajenos y bloqueando SP/API sin contrato. Use when the user invokes /work-apply or asks to implement an approved OpenSpec change.
disable-model-invocation: true
---

# /work-apply `<id>`

## Precondiciones

- `plan-approval.json` vigente (mismo contextHash y planHash).
- Contratos `stored-procedure` / `api-contract` en `CONFIRMED`. Si no, **bloqueá**; no inventes firmas. Mocks sólo de contratos ya aprobados y marcados como mock.
- Capturá `git status --porcelain` **antes** de editar. No reviertas ni incluyas cambios staged/unstaged/untracked ajenos.

## Pasos

1. Invocá apply nativo: Claude `/opsx:apply`, Cursor `/opsx-apply` (ver `.ai/openspec-commands.json`).
2. Conservá arquitectura y convenciones del repo. Cargá `knowledge-backend` o `knowledge-frontend` sólo si aplica.
3. Actualizá checkboxes de `tasks.md` sólo con trabajo efectivamente hecho.
4. Correcciones pequeñas: registralas. Cambios materiales: volvé a `/work-propose`.
5. Al modificar código, invalidá verify/security previos (`.ai/tmp/gates-invalidated.json`).
6. Si el working tree ajeno impide verificación fiable, diagnosticá y proponé worktree aislado; no lo uses sin autorización.

No hay scheduler multi-repo. Cada repo tiene su changeId/branch/headSha.
