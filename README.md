# Developer AI Kit (`@team-ai/engineering-kit`)

Kit portable **v1.0.0** para que frontend y backend trabajen con **Claude Code** y **Cursor** el mismo procedimiento: Azure Work Item → OpenSpec → código → verify → security-compliance → commit → PR.

No impone otra arquitectura. No incluye dashboard TL ni motor LLM propio. El auditor de seguridad es la skill existente `security-compliance` (no se reconstruye).

## Requisitos

- Node.js **≥ 20.19.0**
- Git
- OpenSpec CLI (`npm i -g @fission-ai/openspec`) e `openspec init --tools claude,cursor` en el repo de producto
- Skill `security-compliance` en `~/.cursor/skills/security-compliance` (o `TEAM_AI_SECURITY_SKILL`)
- Azure DevOps: Azure CLI o OAuth del MCP oficial. Sin acceso, el kit opera con fixtures y deja gates en `NOT_AVAILABLE`

## Instalar en un repo BE/FE

Desde este kit:

```powershell
npm install
npm run build
node dist/cli.js setup --target C:\ruta\al\repo --role backend --hosts claude,cursor --org tu-org --project tu-proyecto
node dist/cli.js doctor --target C:\ruta\al\repo
```

Linux/macOS es el mismo `node dist/cli.js` (sin Bash obligatorio). Wrappers: `scripts/team-ai.ps1`.

Opciones: `--dry-run`. Update: `node dist/cli.js update --target ...`. Uninstall: `node dist/cli.js uninstall --target ...` (solo archivos administrados).

## Recorrido mínimo por tarea Azure

En el chat del host (comandos lógicos del kit):

```text
/work-item 3215
/work-propose 3215          → nativo: Claude /opsx:propose · Cursor /opsx-propose
<revisión humana del plan>
/work-apply 3215            → nativo: Claude /opsx:apply · Cursor /opsx-apply
/verify-change 3215
/security-review 3215 --changes
/security-fix 3215          (si hay findings autorizados)
/verify-change 3215 + /security-review 3215
/commit-change 3215 --preview
/commit-change 3215
/pr-ready 3215
```

OpenSpec **no** trae `/work-*`. Los aliases reales se listan en `.ai/openspec-commands.json` (doctor). `/opsx:verify` solo si el perfil expandido está instalado.

## Qué requiere acceso real

| Capacidad | Sin acceso |
|---|---|
| Work Items Azure MCP | Contexto local desde `--context` / fixtures; doctor: MCP auth `not_configured` |
| Skill security-compliance | Gate `NOT_AVAILABLE`; no se finge PASS |
| Host Claude o Cursor | Prueba estructural de archivos; matriz de host queda pendiente |

## Documentación

- [Guía del developer](docs/developer-guide.md)
- [Comandos por host](docs/commands-by-host.md)
- [MCP y permisos](docs/mcp-permissions.md)
- [Fingerprint](contracts/fingerprint.md)
- [Matriz KIT-AC01–AC24](docs/acceptance-matrix.md)
- [ADR](docs/adr/0001-core.md)
