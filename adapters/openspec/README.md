OpenSpec no se reimplementa.

- Comandos nativos: Claude `/opsx:propose|/opsx:apply`, Cursor `/opsx-propose|/opsx-apply`.
- `/opsx:verify` sólo si el perfil expandido está instalado (`openspec config profile`).
- Wrappers del kit: `/work-propose`, `/work-apply` con changeId `wi-<id>-<slug>` y aprobación por contextHash+planHash.
