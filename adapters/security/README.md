Adaptador de auditoría: `src/security.ts`.

- Invoca `python <skill>/scripts/sc.py diff|audit --project <repo> --json`.
- Path: manifiesto, `TEAM_AI_SECURITY_SKILL`, `~/.cursor/skills/security-compliance`.
- No modifica el core de la skill. Review no edita el working tree.
- Normaliza a `team-ai/v1` security-report. Markdown fallback con contrato de secciones.
