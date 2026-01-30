# Repository Guidelines

## Reglas obligatorias

- Lee y cumple `CLAUDE_RULES.md` antes de actuar; limita el alcance al pedido.
- No reinicies frontend/backend sin solicitarlo primero.
- Si hay dudas sobre alcance o impacto, pregunta antes de ejecutar cambios.
- Responde siempre en español.
- Tras cada implementacion, registra una descripcion breve en `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md`: si ya hay un dia abierto agrega un bullet; si es el primer cambio del dia agrega la fecha y el primer bullet.
- Si la tarea es la implementación de MindFeed Compliance v1, revisa siempre `docs/CHECKPOINTS_MINDFEED_COMPLIANCE_V1.md` antes de continuar y actualízalo al cerrar cada subfase.

## Project Structure & Module Organization

- `src/` React SPA agrupada por feature: UI en `components/`, estado en `contexts/`, llamadas en `services/`, helpers en `utils/`.
- `backend/` API Express: entrypoints en `routes/`, lógica de dominio en `services/`, guardias en `middleware/`, SQL versionado en `migrations/` y `sql/`.
- Assets en `public/`; Vite compila a `dist/` (no versionar).
- Revisa `docs/` y playbooks raíz antes de tocar entrenamientos, nutrición o rutinas.
- Scripts operativos (`scripts/`, `check_*.mjs`, `apply_db_*.mjs`) gestionan puertos y parches; ejecútalos desde la raíz.

## Build, Test, and Development Commands

- `npm run install:all` instala dependencias frontend + backend en una sola pasada.
- `npm run dev` inicia Vite en 5173; `npm run dev:backend` (o `npm --prefix backend run dev`) levanta la API en 3010.
- Usa `npm run dev:all` para levantar ambos servicios; `npm run dev:auto` es el arranque recomendado con sincronización de puertos.
- `npm run dev:sync` verifica puertos antes de levantar frontend; `npm run check-ports` solo valida/sincroniza.
- `npm run build` genera el bundle productivo y `npm run preview` permite validarlo localmente.
- Calidad: `npm run lint` (ESLint), `npm run monitor` (salud servicios).
- Backend en 3010 es fijo (hardcodeado); no cambiar el puerto.

## Coding Style & Naming Conventions

- JavaScript/JSX con indentación de 2 espacios, comillas dobles y punto y coma; ESLint (`eslint.config.js`) es la fuente de verdad.
- Componentes en PascalCase (`components/ProfileSection.jsx`), hooks/utilidades en camelCase, context providers en `contexts/` con sufijo `Provider`.
- Backend: controladores en `routes/`, dominio en `services/`, utilidades compartidas en `utils/`.
- Prettier corre vía lint-staged; no omitas el hook salvo casos documentados.

## Testing Guidelines

- `npm test` retorna placeholder; registra pruebas manuales o scripts específicos en tu PR.
- Playwright E2E está en `tests/`: `npx playwright test` y `npx playwright show-report`.
- `node test_refactorization.mjs` valida el flujo completo de entrenamiento (requiere `DATABASE_URL` y `JWT_SECRET`).
- `node test-routine-fixes.js` verifica endpoints críticos; define `AUTH_TOKEN` con un JWT válido antes de correrlo.
- Añade pruebas automatizadas en cambios críticos y describe la cobertura lograda.

## Commit & Pull Request Guidelines

- Usa Conventional Commits en español como en `feat(ui): feedback ejercicios en pestaña hoy`.
- Los PRs deben incluir resumen, instrucciones de validación local, issues vinculadas y capturas o gifs para cambios visuales.
- Documenta migraciones o scripts requeridos e indica impactos front-back.
- Si hay cambios arquitectónicos mayores, actualiza `WARP.md`.

## Architecture Guardrails

- No modifiques el flujo de metodologías en frontend; es agnóstico por diseño.
- Usa siempre el sistema de redirección para nuevas metodologías.
- No tocar el punto de convergencia en `WorkoutContext.generatePlan()`.

## Environment & Configuration Tips

- Crea `.env` para frontend y backend con `VITE_*`, `DATABASE_URL`, `JWT_SECRET`, `DB_SEARCH_PATH`; dotenv se carga fuera de producción.
- Mantén `logs.txt` y `backend/logs.txt` fuera de commits, pero utilízalos para diagnósticos y comparte fragmentos relevantes.
- Nunca publiques ni commitees credenciales; `.env` y `.mcp.json` deben estar en `.gitignore`.

## MCP & Supabase

- Cuando trabajemos con MCP, usar siempre el proyecto `lhsnmjgdtjalfcsurxvg` en Supabase.
- Los servidores MCP solo cargan al inicio; reinicia Claude Code si cambias la configuración.
