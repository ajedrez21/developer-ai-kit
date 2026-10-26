---
name: work-propose
description: Crea una propuesta OpenSpec a partir de la tarea Azure ya recuperada y del código actual del repo. Use when the user invokes /work-propose or needs a spec/design/tasks plan before coding.
disable-model-invocation: true
---

# /work-propose `<id>`

## Objetivo

Generar la propuesta nativa de OpenSpec con la definición Azure ya guardada y el código actual. Este wrapper no mantiene una segunda lista de tasks. No pidas paquete TL ni archivos externos.

## Pasos

1. Cargá el contexto local `.ai/work-items/<org>-<project>-<id>/` (org/project de `.ai/kit-manifest.json`). Si no existe o `readiness.status == BLOCKED`, no propongas: falta la tarea de Azure (`/work-item` primero).
2. Fuente de requisitos: título, descripción, criterios, comentarios e imágenes de esa tarea. No esperes `work-context.json` del TL ni otro adjunto.
3. Leé código y tests reales de la rama actual. Citá al menos una implementación comparable si existe. El plan se apoya en el código que hay, no en un diseño externo.
4. Mapeá `changeId = wi-<id>-<slug>` de forma estable. No copies la Task de Azure como proposal.md.
5. Leé `.ai/openspec-commands.json` (lo escribe setup/doctor):
   - Claude Code: `/opsx:propose`
   - Cursor: `/opsx-propose`
   - No uses `/ospx-*`. Si verify no está instalado, no lo finjas.
6. Invocá el propose **nativo**. El plan cubre scope, riesgos y aceptación **de la tarea**. Contratos SP/API sólo si la tarea los define; si no, no los inventes ni bloquees el plan.
7. Generá plan de validación y archivos candidatos. Mostrá el plan al developer.
8. Guardá ya `.ai/work-items/<...>/plan-approval.json` ligado a `contextHash`, `planHash`, repo y `baseSha` de la versión que acabás de generar. No pidas una autorización aparte: invocar `/work-propose` arma esa aprobación. `approvedBy` es quien invocó el comando.
9. Si el plan cambia y el `planHash` es otro, actualizá `plan-approval.json` a esa versión. Si es la misma versión, no la reescribas.

Correr después `/work-apply` es la aprobación para implementar. Si el resultado no cierra, el developer itera y vuelve a `/work-propose` para actualizar el plan.
