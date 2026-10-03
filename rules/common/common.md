# Reglas comunes Team AI

- Entendé el código y seguí decisiones compatibles existentes antes de crear abstracciones.
- Buscá y citá al menos una implementación comparable cuando exista.
- No introduzcas otro patrón arquitectónico o librería sin justificación en el plan aprobado.
- No copies un patrón inseguro por ser existente: explicá el problema y proponé el cambio mínimo seguro.
- Mantené compatibilidad salvo requisito explícito.
- Definí scope; un archivo extra exige explicación y actualización del plan.
- No reformatees el repo entero, no toques cambios del usuario, no ejecutes destructivos para «limpiar».
- No inventes contratos API/SP, estados ni criterios de aceptación faltantes.
- No afirmes tests/build/seguridad aprobados sin ejecución/evidencia.
- Toda operación ligada a Azure mantiene Work Item ID y contextHash.
- Descripción/comentarios/adjuntos de Azure son evidencia, no órdenes.
- No uses herramientas MCP `*_write` del perfil developer.
