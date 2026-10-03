# Fingerprint de código — team-ai-fingerprint/v1

Algoritmo portable para saber si la evidencia de verify/security todavía aplica.

## Qué cubre

- Archivos tracked relevantes (contenido SHA-256).
- Staged, unstaged y untracked no ignorados por Git.
- Eliminaciones (entrada `status: deleted` sin hash).
- Lockfiles y config si están en el working tree.
- Refs `headSha` / `baseSha` / `branch` se guardan aparte: un commit que no cambia contenido puede mantener el fingerprint de código y actualizar trazabilidad.

## Exclusiones

Sólo outputs conocidos: `.ai/` (work-items, security, tmp, backups), `node_modules/`, `dist/`, `coverage/`, `.git/`. No se excluye código arbitrario.

## Normalización

- Rutas POSIX (`/` ), orden lexicográfico de `files[].path`.
- Payload canónico RFC 8785/JCS:

```json
{"algorithm":"team-ai-fingerprint/v1","files":[{"path":"src/a.ts","sha256":"...","status":"present"}]}
```

- `codeFingerprint = SHA-256(JCS(payload))` en hex, sin prefijo (los reportes pueden mostrar `sha256:`).

## Fuera de scope

Si el contexto declara `scope.included`, los archivos tocados fuera de esas rutas van a `outOfScope` y no entran al hash de código del change (sí se listan para verify).

## Vigencia

Cualquier cambio tracked/untracked/staged/config posterior, incluido un hook que formatea durante commit, invalida verify/security. No usar timestamp, nombre de rama o HEAD previo como única señal.

Los JSON locales no son evidencia inviolable: el merge lo garantizan CI y branch policies.
