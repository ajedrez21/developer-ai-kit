---
name: verify-change
description: Compara plan/spec/aceptación contra la implementación, ejecuta checks reales del repo y escribe verify-report con fingerprint. Use when the user invokes /verify-change or needs evidence that a work item change was validated.
disable-model-invocation: true
---

# /verify-change `<id>`

## Pasos

1. Ejecutá `node <kit>/dist/cli.js verify --target . --id <id>`.
2. Completá criterios de aceptación con evidencia de código/tests (el script no los marca PASS solo).
3. Estados de check: `PASS|FAIL|REVIEW|NOT_RUN|NOT_AVAILABLE|STALE`. Ausencia de herramienta **nunca** es PASS.
4. Check no aplicable: registrá motivo de applicability; no es fallo de configuración.
5. Mostrá previstos vs tocados (p. ej. 5/6) y la razón del extra.
6. Guardá `verify-report.md` + `verify-report.json` con contextHash, snapshot Git y `checkedFingerprint`.
7. Copiá el fingerprint a `.ai/tmp/latest-verify-fingerprint.txt` y `.ai/tmp/current-fingerprint.txt`.

No generes tests triviales que repitan la implementación. No almacenes secretos en logs.
