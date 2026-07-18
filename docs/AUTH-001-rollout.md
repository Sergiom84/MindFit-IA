# AUTH-001 — Refresh rotatorio y revocación fail-closed (rollout)

Cierre del hallazgo AUTH-001 de la auditoría ECI: "logout no revoca el JWT y refresh
prolonga tokens robados". Implementado en PR 3 (backend) y PR 4 (cliente), **detrás de
flags** para permitir un despliegue fasado sin romper clientes existentes.

## Esquema

- **Access token** JWT corto con `jti = session_id` (revocable por sesión).
- **Refresh token** opaco e independiente, formato `<sessionId>.<random>`; en BD solo se
  guarda su **hash SHA-256** (`app.user_sessions.refresh_token_hash` + `refresh_expires_at`).
- **`/refresh` rotatorio fail-closed**: valida el hash con `SELECT … FOR UPDATE`; en cada
  uso emite un nuevo access + un nuevo refresh (rota el hash). **Reuso** de un refresh ya
  rotado ⇒ se revoca la familia (la sesión, `is_active=FALSE`) y se registra el incidente.
- **Middleware**: con `AUTH_FAIL_CLOSED` rechaza tokens cuya sesión (`jti`) no esté activa
  o si la comprobación falla. Tokens legacy sin `jti` pasan por la ventana de gracia.

## Flags (env)

| Flag                     | Def       | Activación        |
| ------------------------ | --------- | ----------------- |
| `ACCESS_TOKEN_TTL`       | `7d`      | `15m`             |
| `REFRESH_TOKEN_TTL_DAYS` | `30`      | `30`              |
| `AUTH_FAIL_CLOSED`       | `0` (off) | `1`               |
| `AUTH_LEGACY_GRACE`      | `1` (on)  | `0` (último paso) |

Con los valores por defecto, el comportamiento es **idéntico al actual** (access de 7d,
revocación permisiva), aunque login/register ya emiten `refreshToken` y `/refresh` ya
soporta la vía rotatoria.

## Secuencia de despliegue (fasada, en Render)

1. **Deploy 1 — código (este trabajo)**. Backend y cliente desplegados con flags por
   defecto. El cliente ya guarda y envía el `refreshToken`; el backend lo emite y rota.
   Nada cambia para clientes viejos (siguen con JWT de 7d y vía legacy de `/refresh`).
   _La migración `20260718_auth001_refresh_rotativo` debe estar aplicada antes._ ✅ (aplicada)
2. **Deploy 2 — activar rotación corta + fail-closed**: `ACCESS_TOKEN_TTL=15m` y
   `AUTH_FAIL_CLOSED=1`. Requiere que el cliente compatible (Deploy 1) esté ya en manos de
   los usuarios. Los tokens legacy (7d, sin `jti`) siguen aceptados por la gracia.
   **Activado en Render el 2026-07-18**, con `REFRESH_TOKEN_TTL_DAYS=30` y
   `AUTH_LEGACY_GRACE=1`; deploy verificado `live` y `/api/health` correcto.
3. **Deploy 3 — retirar la gracia legacy**: `AUTH_LEGACY_GRACE=0`, cuando la mayoría de
   tokens de 7d hayan caducado (≥7 días tras el Deploy 2). A partir de aquí, un token sin
   `jti` se rechaza con fail-closed. **No ejecutar antes del 2026-07-25**.

**Rollback**: poner los flags a sus valores por defecto revierte al comportamiento actual
sin cambios de esquema (las columnas nuevas son nullable e inertes con los flags off).

## Almacenamiento del refresh token — decisión

- **Hoy (web y móvil)**: el refresh token vive en `localStorage` (clave `refreshToken`,
  gestionada por `src/utils/tokenManager.js`). **Riesgo aceptado y acotado**: al ser
  rotatorio, de vida limitada y con detección de reuso (un robo que se use tras la
  siguiente rotación revoca la familia), la ventana de abuso es mucho menor que la del
  antiguo JWT de 7 días. La activación del access de 15m reduce aún más la exposición del
  access token.
- **Endurecimiento pendiente (follow-up)**:
  - **Web**: mover el refresh a cookie `HttpOnly` + `Secure` + `SameSite`. Requiere que el
    backend fije/lea cookies y ajustes de CORS/credenciales + CSRF; es un cambio
    transversal a todos los `fetch`, fuera del alcance de este PR.
  - **Capacitor (Android/iOS)**: guardar el refresh en almacenamiento seguro nativo. **No
    hay plugin de secure-storage instalado** ni detección de plataforma nativa en el código
    actual; añadirlo implica un plugin nuevo + rebuild nativo (se coordina con OPS-002).

## Verificación realizada

- Backend (smoke + E2E en navegador vía proxy same-origin): `/register` y `/login` emiten
  `refreshToken`; `/refresh` rota (200, refresh nuevo); reuso del refresh antiguo ⇒
  `401 REFRESH_REUSE` y familia revocada; el refresh rotado tras la revocación ⇒
  `401 SESSION_REVOKED`.
- Cliente: `tokenManager.setTokens(access, refresh)` persiste `refreshToken` en
  `localStorage` y `getRefreshToken()` lo devuelve; login/register de la UI ahora pasan
  `data.refreshToken` a `contextLogin` → `setTokens`.
- Tests unit de las primitivas de token (`backend/tests/authTokens.test.js`).
