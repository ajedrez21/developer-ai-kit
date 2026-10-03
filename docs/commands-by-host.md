# Comandos por host

Fuente: OpenSpec `docs/supported-tools.md` (abril 2026+), Cursor Skills, Claude Code Skills.

| Intento del kit | Claude Code | Cursor |
|---|---|---|
| Proponer OpenSpec | `/opsx:propose` | `/opsx-propose` |
| Aplicar OpenSpec | `/opsx:apply` | `/opsx-apply` |
| Verify OpenSpec (perfil expandido) | `/opsx:verify` o no instalado | `/opsx-verify` o no instalado |
| Work item | `/work-item` | `/work-item` |
| Propose wrapper | `/work-propose` | `/work-propose` |
| Apply wrapper | `/work-apply` | `/work-apply` |
| Verify kit | `/verify-change` | `/verify-change` |
| Security | `/security-review` + `/security-compliance diff` | igual |
| Fix | `/security-fix` | `/security-fix` |
| Commit | `/commit-change` | `/commit-change` |
| PR | `/pr-ready` | `/pr-ready` |

Doctor escribe `.ai/openspec-commands.json` con los nombres reales detectados. No usar `/ospx-*`.

Skills canónicas: `skills/*/SKILL.md`. Setup copia a `.claude/skills/<name>/` y `.cursor/skills/<name>/`. No editar los generados.
