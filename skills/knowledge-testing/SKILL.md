---
name: knowledge-testing
description: Procedimientos de testing cargables bajo demanda para el kit Team AI. Use when adding or running tests for a work item change.
disable-model-invocation: true
---

# Testing (bajo demanda)

1. Ejecutá el comando real del repo (`npm test`, `dotnet test`, etc.).
2. No generes tests que sólo repiten la implementación.
3. Un test que no corre es `NOT_RUN`/`NOT_AVAILABLE`, nunca PASS.
4. Preferí el estilo y las factories ya usadas.
5. Registrar comando, exit code, duración y resumen; redactar secretos.
