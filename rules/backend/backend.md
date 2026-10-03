# Backend (template hasta analizar el repo)

Estas reglas son **template**. La primera aplicación debe basarse en evidencia de `team-ai analyze-rules`.

- Ubicá lógica de negocio, acceso a datos, DI, DTOs y tests según el código existente.
- Controller→Service→Repository sólo si el análisis encontró esos símbolos.
- No expongas entidades internas en responses.
- SP: contrato `CONFIRMED` obligatorio; no alterar la SP ni adivinar parámetros.
- Authz en el mismo lugar que el resto de endpoints comparables.
