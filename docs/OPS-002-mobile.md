# OPS-002 — Toolchain móvil reproducible

## Estado

- **Android**: build del AAB **reproducible en CI** (`.github/workflows/android.yml`,
  Java 21 + Node 20). Sin secretos → AAB de release **sin firmar** (valida el build
  nativo); con secretos → **AAB firmado de staging**. `gradlew` con permiso ejecutable.
- **Versionado**: fuente única. `versionName` = `package.json` `version`; `versionCode`
  = número de run de CI (`-PappVersionCode`/`-PappVersionName` en `app/build.gradle`).
- **iOS**: **bloqueo externo**. Requiere macOS + Xcode + certificados de firma + cuenta
  de Apple Developer, no disponibles en el CI actual. No se marca como cerrado.
- **Release web**: reproducible vía `npm run build` (verificado en CI `build-test`, servido
  por Express en Render con el mismo origen).

## Secrets de firma (GitHub → Settings → Secrets and variables → Actions)

Para producir el AAB **firmado** en CI, configurar:

| Secret                    | Contenido                                                        |
| ------------------------- | ---------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64` | keystore `.jks`/`.keystore` en base64 (`base64 -w0 mi.keystore`) |
| `ANDROID_STORE_PASSWORD`  | password del store                                               |
| `ANDROID_KEY_ALIAS`       | alias de la clave                                                |
| `ANDROID_KEY_PASSWORD`    | password de la clave                                             |

El workflow decodifica el keystore a `android/app/release.keystore` (gitignored) y escribe
`android/keystore.properties` en el runner. En local, el mismo `keystore.properties`
(gitignored) sigue funcionando.

## iOS — procedimiento manual (hasta tener CI macOS)

1. `npm run ios:sync` (build web modo móvil + `cap sync ios`).
2. Abrir en Xcode: `npm run ios:open`.
3. Configurar _Signing & Capabilities_ (equipo + provisioning).
4. _Product → Archive_ → subir a TestFlight.

Bloqueo: sin macOS/certificados no es reproducible en este CI; queda como acción externa.

## Cómo obtener el AAB

- CI: workflow **Android** (manual `workflow_dispatch` o push a `main` que toque
  `android/**`/`src/**`). Artefacto `android-aab-signed` / `android-aab-unsigned`.
- Local: `npm run build:mobile && npx cap sync android && (cd android && ./gradlew bundleRelease)`.
