# Cómo funciona Supabase y el servidor local en este proyecto

Este repo **no usa Supabase como “backend completo”** (Auth + PostgREST + RPC desde el cliente), sino como **PostgreSQL gestionado**. El backend real es un servidor **Express local/remoto** que habla con esa base de datos.

Si vienes de Next.js + Supabase, piensa en esto como: **React (Vite) + API propia (Express) + Supabase solo como BD/Storage**.

## Mapa mental rápido

- Frontend: React SPA con Vite en `src/`.
- Backend: API Express en `backend/`.
- Base de datos: PostgreSQL en Supabase, accedido desde el backend vía `pg` y `DATABASE_URL`.
- Storage: al menos un bucket público de videos en Supabase Storage.

Flujo típico:

1. El frontend llama a `/api/...`.
2. Vite hace proxy al backend en desarrollo.
3. El backend ejecuta lógica, valida JWT y consulta PostgreSQL (Supabase).
4. El backend responde JSON al frontend.

## Qué está en Supabase

### 1) La base de datos principal (PostgreSQL)

El backend se conecta **directamente** a Supabase PostgreSQL usando `pg` y `DATABASE_URL` en `backend/db.js`.

Puntos clave:

- La “fuente única de verdad” es `DATABASE_URL`.
- Se fuerza `search_path` a `app,public` por conexión.
- El backend espera tablas como `app.users`, `app.user_sessions`, etc.

Referencias:

- Conexión y `search_path`: `backend/db.js`.
- Inventario/estructura de la BD en Supabase (proyecto `lhsnmjgdtjalfcsurxvg`): `docs/SUPABASE_DATABASE_CONTEXT.md`.

### 2) Supabase Storage (videos)

Hay al menos un uso explícito de Storage público para videos de ejercicios:

- URL pública hardcodeada para desarrollo: `src/config/exerciseVideos.js`.
- Apunta al bucket público `exercise-videos` del proyecto `lhsnmjgdtjalfcsurxvg`.

Importante: aquí se usa como **CDN/hosting de assets**, no como backend de negocio.

### 3) Qué NO parece estar en Supabase

Por lo que se ve en el código:

- No se usa Supabase Auth desde el frontend.
- No se usan endpoints PostgREST/RPC de Supabase desde el cliente.
- El paquete `@supabase/supabase-js` está declarado en `backend/package.json`, pero no aparece importado en el backend actual.

## Qué está en el “servidor local” (backend Express)

El backend es el centro del sistema. Está en `backend/server.js` y monta muchas rutas bajo `/api`.

### 1) Autenticación propia con JWT

La autenticación no pasa por Supabase Auth. Se hace así:

- Login/registro contra tablas propias (`app.users`): `backend/routes/auth.js`.
- Verificación de token con `JWT_SECRET`: `backend/middleware/auth.js`.
- Gestión de sesiones (actividad, timeouts, limpieza): ver `docs/SESSION_MANAGEMENT_SYSTEM.md` y los servicios en `backend/services/` y `backend/jobs/`.

### 2) API de dominio + lógica de negocio

El backend concentra:

- Endpoints de rutinas, sesiones, catálogos, estado, nutrición, etc.: se montan en `backend/server.js`.
- Servicios con lógica de negocio: `backend/services/`.
- Jobs/schedulers (limpieza, mantenimiento): `backend/jobs/`.

### 3) Integración con IA (OpenAI)

También está centralizada en el backend:

- Configuración de módulos/modelos: `backend/config/aiConfigs.js`.
- Inicialización/validación de prompts y API keys: en el arranque de `backend/server.js`.

## Cómo se conectan frontend y backend

### En desarrollo (lo más importante para ti)

El frontend **no llama directo a `http://localhost:3010` por defecto**. Llama a `/api/...` y Vite hace proxy.

Piezas clave:

- Base URL del cliente API:
  - Si existe `VITE_API_URL`, usa `${VITE_API_URL}/api`.
  - Si no, usa `/api`.
  - Referencia: `src/lib/apiClient.js`.
- Proxy de Vite:
  - Todo `/api` se proxya a `VITE_API_URL` o a `http://localhost:${VITE_API_PORT || 3002}`.
  - Referencia: `vite.config.js`.

Ojo con esto: las guías del repo dicen que el backend es **fijo en 3010**, pero Vite tiene un fallback a `3002` si no hay variables. Eso explica muchos “no entiendo qué servidor está usando”.

### En producción

El backend puede servir el frontend compilado:

- Sirve `dist/` como estático y hace catch-all para rutas no `/api`.
- Referencia: `backend/server.js`.

## Variables de entorno que mandan de verdad

Las más importantes para entender el sistema son:

- Backend:
  - `DATABASE_URL`: conexión a Supabase Postgres. Crítica. Ver `backend/db.js`.
  - `DB_SEARCH_PATH`: por defecto `app,public`. Ver `backend/db.js`.
  - `JWT_SECRET`: firma/verificación de tokens. Ver `backend/middleware/auth.js`.
  - `PORT`: puerto del backend (si no, 3010). Ver `backend/server.js`.
  - `OPENAI_API_KEY`: IA. Ver `backend/config/aiConfigs.js`.
- Frontend:
  - `VITE_API_URL`: si la defines, el frontend deja de depender del proxy por defecto. Ver `src/lib/apiClient.js` y `vite.config.js`.
  - `VITE_API_PORT`: afecta el proxy de Vite si no hay `VITE_API_URL`. Ver `vite.config.js`.

## Checklist mental para no perderte

Si algo “no conecta”, normalmente es una de estas 4 cosas:

1. El backend está en 3010 pero el proxy apunta a 3002.
2. `DATABASE_URL` no está bien y el backend no llega a Supabase.
3. `JWT_SECRET` no coincide y los 401/403 vienen por ahí.
4. Estás pensando en Supabase Auth/PostgREST, pero aquí el backend Express es quien manda.

## Dónde mirar según el tipo de duda

- “¿Qué endpoint real se llama?”: `backend/server.js` y la ruta específica en `backend/routes/`.
- “¿De dónde sale este dato?”: `backend/services/` y consultas a `pool`.
- “¿Esto vive en Supabase o local?”:
  - BD en Supabase: `backend/db.js` + `docs/SUPABASE_DATABASE_CONTEXT.md`.
  - Lógica/autenticación/API: `backend/`.
  - Storage público (videos): `src/config/exerciseVideos.js`.

---

Si quieres, en el siguiente paso te preparo un **mapa de endpoints por dominio** (auth, rutinas, sesiones, nutrición, etc.) con “ruta → servicio → tablas Supabase implicadas”.
