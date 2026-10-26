# Developer AI Kit v1.0.0: `/work-item` no funciona siguiendo la guía

> **Estado (2026-10-26):** informe histórico. El pin MCP 1.4.0 y `npx team-ai` ya no aplican.
> `/work-item` autentica **como tl-control** (`AZURE_DEVOPS_EXT_PAT` en `.env` local); el CLI hace REST GET. MCP es opcional.
> Guía vigente: [guia-devs.html](guia-devs.html) y [developer-guide.md](developer-guide.md).

Fecha: 2026-10-13
Kit: `ajedrez21/developer-ai-kit`, commit `90437cf` (2026-10-11)
Entorno: Windows 11, Node v24.14.0, Claude Code, repos `NWebCore.Backend` y `NWeb.Frontend` en `sandbox`

## Resumen

Se siguió la guía "Cómo instalar y usar el kit en Backend y Frontend" (secciones 4, 5, 6 y 7). `setup`, `openspec init`, `update` y `doctor` terminan sin errores en backend y frontend. Pero al ejecutar `/work-item 6646` en Claude Code, el flujo queda **BLOCKED** y no crea rama ni contexto.

Hay **dos defectos en el kit** y **un hueco en la guía**:

1. El kit fija `@azure-devops/mcp@1.4.0`, una versión que **no existe en npm**. El servidor MCP `ado-developer` nunca conecta (`CONNECTION_CLOSED`).
2. El kit da **instrucciones contradictorias** sobre cómo ejecutar su CLI, y ninguna funciona con el procedimiento de instalación de la guía.
3. La guía no explica cómo encuentra el CLI el agente al correr `/work-item`.

Cualquier developer que siga la guía al pie de la letra va a chocar con los mismos errores.

## Síntoma observado

Salida del agente al correr `/work-item 6646` en el repo:

- `npx team-ai work-item ...` falla con "could not determine executable to run".
- `node_modules/@team-ai/engineering-kit/dist/cli.js` no existe.
- El servidor `ado-developer` falla con `CONNECTION_CLOSED`.
- No se creó la rama local ni se escribió nada en `.ai/work-items/`.

## Problema 1: versión inexistente del MCP de Azure DevOps

**Dónde está el pin**
- `src/mcp.ts:3`: `export const AZURE_MCP_PINNED = "@azure-devops/mcp@1.4.0";`
- `src/setup.ts:129`: `azureDevOpsMcp: "@azure-devops/mcp@1.4.0"`
- Guía, secciones 2.1, 6, 6.1, 6.2, 6.3, 6.4: todas piden `1.4.0`.

**Evidencia**
- `npx -y @azure-devops/mcp@1.4.0 --help` falla con `npm error code ETARGET: No matching version found for @azure-devops/mcp@1.4.0`.
- Versiones publicadas en el registro público (`registry.npmjs.org`): 1.0.0, 1.1.0, 1.2.0, 1.2.1, 1.3.0, 1.3.1 y luego la serie 2.x (última estable 2.10.0; dist-tag `latest` = 2.10.0). La 1.4.0 nunca se publicó.
- La 1.3.1 no sirve como reemplazo: su `--help` no tiene las opciones `-d/--domains` ni `-a/--authentication`, que el kit necesita (`--authentication azcli -d core work work-items repositories`).
- La 2.10.0 sí las tiene, y arranca con esos parámetros contra `DMEDLATSYS` (log: `"Starting Azure DevOps MCP Server" ... "authentication":"azcli" ... "version":"2.10.0"`).

**Qué hice en local**
En los `.mcp.json` y `.cursor/mcp.json` de ambos repos reemplacé `@azure-devops/mcp@1.4.0` por `@azure-devops/mcp@2.10.0`. Verifiqué que el servidor arranca. **No** verifiqué todavía que lea un Work Item real; eso queda para el próximo `/work-item`.

**Ojo:** `update` regenera esos archivos con el valor del código, así que vuelve a `1.4.0`.

**Posibles causas a revisar (para quien conozca el origen del pin):** pudo haberse tomado de un registro interno o de una versión que ya no está publicada, o ser un error de tipeo (¿1.3.1?). Si fue 1.3.1, el kit usa opciones que esa versión no tiene.

## Problema 2: instrucciones contradictorias para ejecutar el CLI

El kit le dice al agente tres cosas distintas:

| Fuente | Qué indica | Funciona con la guía |
|---|---|---|
| `CLAUDE.md` que escribe `setup` (origen: `src/setup.ts:358`) | `npx team-ai` o `node node_modules/@team-ai/engineering-kit/dist/cli.js` | No. Supone que el kit está instalado como dependencia del repo de producto. |
| Skills `work-item` (línea 15) y `verify-change` (línea 11) | `node <kit>/dist/cli.js ...` | No. `<kit>` es un placeholder sin definir. |
| Guía, sección 4.1 | "El kit no se instala como app: se usa desde esta carpeta para configurarlo" | Describe solo el `setup`, no el uso diario. |

**Qué pasa**
El agente lee primero el `CLAUDE.md` del repo, prueba `npx team-ai` y falla, porque el kit se clonó y compiló en su propia carpeta y no está en `node_modules` del repo. El backend ni siquiera tiene `package.json`.

**Dato disponible que no se usa:** `.ai/kit-manifest.json` ya guarda `corePath` (ruta absoluta al kit en esa máquina), pero ni las skills ni el `CLAUDE.md` lo referencian.

## Problema 3: hueco en la guía

La guía cubre la instalación (secciones 4 a 9) y el flujo (sección 10), pero entre ambas no dice cómo queda accesible el CLI del kit para el agente. Las secciones 9 y 15 ("Checklist mínimo") dan por verificada la instalación aunque el flujo no pueda ejecutarse.

## Qué funciona

`setup`, `openspec init`, `update` y `doctor` terminan bien. `doctor` queda con un solo chequeo en rojo: "MCP autenticado" (el kit no puede afirmarlo sin una llamada real). Skills, reglas, hooks y manifiesto se generan correctamente.

## Alternativas propuestas

**A. Corregir en el kit y la guía (recomendado, a cargo del equipo)**
- Cambiar el pin del MCP por una versión que exista y soporte `azcli` y dominios (2.10.0 según las pruebas), en `src/mcp.ts`, `src/setup.ts` y las secciones de la guía.
- Unificar la instrucción del CLI. Dos caminos posibles:
  - **A1.** Que el `setup` escriba la ruta real del kit (`corePath`) en el `CLAUDE.md` y las skills, en lugar de `<kit>`.
  - **A2.** Documentar en la guía el paso de `npm link` (ver abajo) y mantener el texto actual del `CLAUDE.md`.
- Agregar al `doctor` un chequeo de que el CLI es resoluble desde el repo, y otro de que la versión del MCP existe.

**B. Workaround local con `npm link` (sirve hasta que se corrija A)**
1. En la carpeta del kit: `npm link`.
2. En cada repo de producto: `npm link @team-ai/engineering-kit`.
   Esto crea `node_modules/@team-ai/engineering-kit` apuntando al kit, y un shim en `node_modules/.bin`, que es justo lo que espera el `CLAUDE.md`.

   Consideraciones:
   - `NWebCore.Backend` no tiene `package.json` ni `node_modules` ignorado en su `.gitignore`: habría que agregar `node_modules/` al `.git/info/exclude` para no ensuciar `git status`.
   - `NWeb.Frontend` ya tiene `package.json` y `node_modules` (ignorado). Por usar npm sobre un `node_modules` existente, conviene verificar después que no cambió `package.json`, `package-lock.json` ni paquetes instalados.
   - El `update` del kit no toca `node_modules`, así que el link sobrevive.
   - Hay que repetirlo en cada máquina y en cada clon nuevo.

**C. Workaround mínimo (sin tocar los repos)**
Indicar la ruta en cada sesión ("el CLI del kit está en `<ruta>\developer-ai-kit\dist\cli.js`"), o dejarla en el `CLAUDE.md` de usuario (`~/.claude/CLAUDE.md`).

## Decisiones que necesitan del equipo

1. ¿Qué versión de `@azure-devops/mcp` corresponde fijar? (la 1.4.0 no existe).
2. ¿Cómo se espera que el agente ubique el CLI: dependencia en el repo (npm link / npm install del kit) o ruta absoluta del kit?
3. ¿Se actualiza el kit y la guía, o se documenta un workaround temporal para todos?

## Otras inconsistencias menores en la guía

- Rutas de ejemplo `C:\Maxi\...`: hay que ajustar todos los `--target` si el clon está en otra ubicación.
- Sección 6.3: el servidor `ado` usa `@azure-devops/mcp` sin versión; `ado-developer` usa una fija.
- La metodología de tareas (sección 3.1) habla de sacar el token desde "NWEB DEV", pero la guía solo remite al video de Postman, sin los pasos.
- Los pasos de "reiniciar Cursor" no aplican a quien trabaja solo con Claude Code.
