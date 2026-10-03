---
name: security-fix
description: Remedia findings de seguridad autorizados a partir del último reporte vigente, luego reejecuta verify y una nueva security-review. Use when the user invokes /security-fix or asks to remediate security findings from a kit report.
disable-model-invocation: true
---

# /security-fix `<id>`

Detectar y remediar están separados. No escribas `RESOLVED` en el reporte original ni emitas PASS vos mismo.

1. Leé `latest.json` y el `review-NNN.json` apuntado. Verificá identity/scope/fingerprint.
2. Revalidá evidencia contra el código actual. Si el fingerprint cambió, el reporte está STALE.
3. Buscá un patrón seguro existente en el repo; si no hay, justificá el cambio mínimo.
4. Aplicá sólo findings autorizados y dentro de scope. No arregles deuda previa por iniciativa.
5. Falso positivo: evidencia + excepción humana. No borres findings para pasar el gate.
6. Si el arreglo exige arquitectura nueva, volvé a `/work-propose`.
7. Corré `/verify-change` y después una **nueva** `/security-review` (fase distinta). Esa revisión decide vigencia.

Podés usar el mismo proveedor LLM con rol de auditoría separado; no prometas independencia organizacional.
