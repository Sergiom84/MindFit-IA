# Repository Guidelines

## Reglas obligatorias

- Lee y cumple `CLAUDE_RULES.md` antes de actuar; limita el alcance al pedido.
- No reinicies frontend/backend sin solicitarlo primero.
- Si hay dudas sobre alcance o impacto, pregunta antes de ejecutar cambios.
- Responde siempre en español.
- Tras cada implementacion, registra una descripcion breve en `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md`: si ya hay un dia abierto agrega un bullet; si es el primer cambio del dia agrega la fecha y el primer bullet.
- Si la tarea es la implementación de MindFeed Compliance v1, revisa siempre `docs/CHECKPOINTS_MINDFEED_COMPLIANCE_V1.md` antes de continuar y actualízalo al cerrar cada subfase.

## Project Structure & Module Organization

- `src/` contiene la SPA React agrupada por feature; las rutas principales están en `src/App.jsx` y los providers compartidos en `src/providers/`.
- `backend/` contiene la API Express: entrypoints en `routes/`, lógica de dominio en `services/`, guardias en `middleware/`, jobs en `jobs/` y SQL versionado en `migrations/`.
- `docs/_active.md` marca la línea de trabajo activa; si una feature tiene carpeta propia en `docs/`, esa documentación pesa más que resúmenes antiguos de la raíz.
- Assets estáticos en `public/`; Vite compila a `dist/` (no versionar).
- Scripts operativos (`scripts/`) gestionan puertos, monitorización y utilidades; ejecútalos desde la raíz.

## Build, Test, and Development Commands

- `npm run install:all` instala dependencias frontend + backend.
- `npm run dev` inicia Vite en `5173`; `npm run dev:backend` levanta la API en `3010`.
- `npm run dev:auto` y `npm run dev:sync` son las opciones recomendadas cuando necesitas sincronizar puertos.
- `npm run build` genera el bundle productivo y `npm run preview` permite validarlo localmente.
- Calidad y verificación: `npm run lint`, `npm run monitor`, `npm run test:backend`.
- El backend en `3010` es fijo; no cambiar ese puerto.

## Coding Style & Naming Conventions

- JavaScript/JSX con indentación de 2 espacios, comillas dobles y punto y coma; `.eslint.config.mjs` es la fuente de verdad.
- Componentes en PascalCase, hooks y utilidades en camelCase, providers/contextos con nombres explícitos.
- Backend: controladores en `routes/`, dominio en `services/`, utilidades compartidas en `utils/` o `lib/`.
- Prettier corre vía lint-staged; no omitas el hook salvo casos documentados.

## Testing Guidelines

- `npm test` sigue siendo un placeholder y no valida comportamiento real.
- La suite automatizada actual está en `backend/tests/` y se ejecuta con `npm run test:backend`.
- Playwright E2E está en `tests/`; usa `npx playwright test` y `npx playwright show-report` cuando el entorno ya esté levantado.
- Añade pruebas automatizadas en cambios críticos y documenta la validación manual cuando no haya cobertura.

## Commit & Pull Request Guidelines

- Usa Conventional Commits en español como `feat(ui): feedback ejercicios en pestaña hoy`.
- Los PRs deben incluir resumen, instrucciones de validación local, issues vinculadas y capturas o gifs para cambios visuales.
- Documenta migraciones o scripts requeridos e indica impactos front-back.
- Si hay cambios arquitectónicos mayores, actualiza `WARP.md`.

## Architecture Guardrails

- No modifiques el flujo de metodologías en frontend; es agnóstico por diseño.
- Usa siempre el sistema de redirección para nuevas metodologías.
- No tocar el punto de convergencia en `WorkoutContext.generatePlan()`.

## Environment & Configuration Tips

- Frontend: `.env.local` con `VITE_*`. Backend: `backend/.env` con `DATABASE_URL`, `JWT_SECRET`, `DB_SEARCH_PATH` y `PORT=3010`.
- Mantén `logs.txt` y `backend/logs.txt` fuera de commits, pero utilízalos para diagnósticos y comparte fragmentos relevantes.
- Nunca publiques ni commitees credenciales; `.env`, `.mcp.json` y ajustes locales de herramientas deben permanecer fuera del repositorio.

## MCP & Supabase

- Cuando trabajemos con MCP, usar siempre el proyecto `lhsnmjgdtjalfcsurxvg` en Supabase.
- Los servidores MCP solo cargan al inicio; reinicia el host de la herramienta si cambias la configuración.
