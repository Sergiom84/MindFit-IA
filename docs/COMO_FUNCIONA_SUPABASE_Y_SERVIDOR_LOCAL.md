# Cómo funciona Supabase y el servidor local en este proyecto

Fecha de revisión: 2026-03-06

## Arquitectura real

Este proyecto usa:

- frontend React + Vite,
- backend Express propio,
- PostgreSQL gestionado en Supabase,
- y Supabase Storage para algunos assets.

No usa Supabase como backend completo desde el cliente. La lógica de negocio y la autenticación viven en `backend/`.

## Flujo mental correcto

1. El frontend llama a `/api/...`.
2. En desarrollo, Vite hace proxy al backend.
3. El backend valida el token, ejecuta lógica y consulta PostgreSQL.
4. Supabase actúa como base de datos gestionada y storage, no como API principal del dominio.

## Qué hace Supabase aquí

### Base de datos

- La conexión principal sale de `backend/db.js` mediante `DATABASE_URL`.
- El backend fuerza `search_path` a `app,public`.
- El proyecto Supabase asociado a este repositorio es `sbqcnlwpvjavmljzkmfy`.

### Storage

- Hay uso de buckets para assets como vídeos de ejercicios.
- Eso no cambia el hecho de que la lógica de negocio sigue pasando por Express.

### Qué no es la fuente de verdad

- No debes asumir Supabase Auth en el frontend.
- No debes asumir PostgREST o RPC como camino principal del producto.

## Qué hace el backend local

- Monta las APIs en `backend/server.js`.
- Gestiona JWT, sesiones, lógica de entrenamiento, nutrición, adaptación, IA y utilidades.
- Sirve `dist/` cuando el frontend está compilado para producción.

## Desarrollo local: puertos y proxy

### Backend

- El puerto operativo esperado es `3010`.
- `backend/server.js` usa `PORT || 3010`.

### Frontend

- El cliente suele hablar con `/api` y delega el destino al proxy de Vite.
- `src/lib/apiClient.js` usa `VITE_API_URL` si existe; si no, usa `/api`.
- `vite.config.js` proxya `/api` a `VITE_API_URL` o a `http://localhost:${VITE_API_PORT || 3002}`.

### Qué significa eso en la práctica

- El fallback `3002` sigue existiendo en Vite por compatibilidad heredada.
- La forma correcta de trabajar en este repo es alinear `VITE_API_PORT=3010` o `VITE_API_URL=http://localhost:3010`.
- `npm run check-ports` y `npm run dev:auto` están precisamente para sincronizar `.env.local` con el backend real.

## Variables relevantes

### Backend

- `DATABASE_URL`
- `DB_SEARCH_PATH`
- `JWT_SECRET`
- `PORT`
- `OPENAI_API_KEY`

### Frontend

- `VITE_API_URL`
- `VITE_API_PORT`
- `VITE_PORT`

## Dónde mirar cuando algo falla

- Conectividad frontend/backend: `vite.config.js`, `.env.local`, `scripts/check-ports.js`
- Conexión a base de datos: `backend/db.js`
- Autenticación: `backend/routes/auth.js`, `backend/middleware/auth.js`
- Rutas activas: `backend/server.js`
- Contexto de base de datos: `docs/SUPABASE_DATABASE_CONTEXT.md`
