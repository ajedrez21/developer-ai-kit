---
name: knowledge-backend
description: Procedimientos backend cargables bajo demanda (arquitectura, SP, DI, tests). Use when implementing backend work after /work-apply or when the change touches API/services/data access.
disable-model-invocation: true
---

# Conocimiento backend (bajo demanda)

No cargues este documento en cada mensaje. Las reglas generales viven en `team-ai-common`.

1. Seguí el patrón real del repo. Controller→Service→Repository **sólo si existe**. Citá rutas/símbolos.
2. No expongas modelos internos ni agregues try/catch redundantes.
3. SP: consumí el contrato confirmado (tipos, nullabilidad, result sets). No alteres la SP. Si falta contrato o disponibilidad de ambiente, bloqueá.
4. Auth/authz, logging y errores: reutilizá middleware existente.
5. Tests: el mismo runner y carpeta que el proyecto.
