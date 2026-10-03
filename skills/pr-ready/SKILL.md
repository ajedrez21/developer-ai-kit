---
name: pr-ready
description: Evalúa de forma determinística si un Work Item está READY para PR, prepara título/body y exporta work-result.json. Use when the user invokes /pr-ready. Does not create a PR unless explicitly requested.
disable-model-invocation: true
---

# /pr-ready `<id>`

Ejecutá `team-ai pr-ready --target . --id <id>`.

`READY` exige: contexto actualizado y plan aprobado; OpenSpec completo; scope justificado; sin cambios ajenos ni secretos; verify y security vigentes; rama según convención; commits con referencia Azure; working tree limpio (outputs `.ai/` permitidos); contratos cumplidos.

`READY FOR PR` **no** crea el PR. Prepará título/body. Crear/publicar sólo si el developer lo pide explícitamente.

Exportá `work-result.json` por repo (`work-result-<repoId>.json`). Nunca sobrescribas resultado BE con FE. No marques el Work Item Done ni cambies assigned-to/sprint.
