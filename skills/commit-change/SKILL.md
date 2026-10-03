---
name: commit-change
description: Crea un commit local sólo con el diff autorizado de un Work Item, mensaje basado en el índice y referencia Azure. Use when the user invokes /commit-change. Never push.
disable-model-invocation: true
---

# /commit-change `<id>` [--preview]

## Precondiciones

Contexto/plan vigente; verify aceptado; seguridad sin bloqueos (o excepciones válidas); mismo fingerprint; sin secretos; cambios ajenos identificados.

## Pasos

1. `git status`, diff vs base y diff del índice.
2. `team-ai commit-preview --id <id> --files a,b,c --summary "feat(area): ..."`.
3. Mensaje desde el diff real, no desde la memoria. Convención:

```text
feat(customers): add status filter #3215

- ...
```

Sintaxis Azure Repos del equipo: `#3215`. Si el remoto es GitHub ligado a Azure, `AB#3215` (política `workItemRefSyntax`).
4. `--preview` no commitea. Commit sólo con invocación explícita y confirmación.
5. `git add -- <archivos propios>`. **Nunca** `git add .`.
6. Staging ajeno o hunks inseparables → bloqueo, no toques el trabajo del usuario.
7. No amend/rebase/reset/force-push. No push, merge, release ni deploy.

Un commit Git manual puede saltarse hooks: CI y branch policies son el enforcement.
