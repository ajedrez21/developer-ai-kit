---
name: work-propose
description: Crea una propuesta OpenSpec ligada a un Work Item Azure, con aprobación versionada por contextHash y planHash. Use when the user invokes /work-propose or needs a spec/design/tasks plan before coding.
disable-model-invocation: true
---

# /work-propose `<id>`

## Objetivo

Generar la propuesta nativa de OpenSpec. Este wrapper no mantiene una segunda lista de tasks.

## Pasos

1. Cargá el contexto local. Si `readiness.status != READY` o hay gaps bloqueantes, no propongas.
2. Leé código y tests reales; citá al menos una implementación comparable si existe.
3. Mapeá `changeId = wi-<id>-<slug>` de forma estable. No copies la Task de Azure como proposal.md.
4. Leé `.ai/openspec-commands.json` (lo escribe `team-ai doctor/setup`):
   - Claude Code: `/opsx:propose`
   - Cursor: `/opsx-propose`
   - No uses `/ospx-*`. Si verify no está instalado, no lo finjas.
5. Invocá el propose **nativo** de la versión detectada. Incorporá contexto TL, scope, contratos, riesgos y aceptación.
6. Generá plan de validación y archivos candidatos. Mostrá el plan al developer.
7. Guardá aprobación explícita en `.ai/work-items/<...>/plan-approval.json` ligada a `contextHash`, `planHash`, repo y `baseSha` **después** de que el developer autorice esa versión.
8. Un cambio material de requisitos/contrato/arquitectura/scope invalida la aprobación. No pidas aprobación de nuevo si la misma versión ya está autorizada.

La revisión humana es del plan de negocio, no de la instalación de este kit.
