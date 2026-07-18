# Toolchain móvil Android (OPS-002)

Guía reproducible para compilar y firmar el AAB de **MindFit / Entrena con IA**
(`appId: com.entrenaconia.app`). El objetivo es que cualquier máquina o runner de CI
produzca el mismo artefacto sin pasos manuales no documentados.

## Requisitos de toolchain

| Herramienta               | Versión requerida                        | Origen / verificación                                                                                                                                      |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JDK**                   | **21** (LTS)                             | Impuesto por `android/app/capacitor.build.gradle` (`JavaVersion.VERSION_21`, fichero **generado por Capacitor, no editar**). Verifica con `java -version`. |
| **Android Gradle Plugin** | 8.13.0                                   | `android/build.gradle` (buildscript classpath)                                                                                                             |
| **Gradle**                | 8.14.3 (wrapper)                         | `android/gradle/wrapper/gradle-wrapper.properties`. Usa **siempre** `./gradlew`, no un Gradle global.                                                      |
| **Android SDK**           | compileSdk 36 / targetSdk 36 / minSdk 24 | `android/variables.gradle`                                                                                                                                 |
| **Node.js**               | 20.x                                     | mismo que el backend/CI (`.github/workflows/ci.yml`)                                                                                                       |
| **Capacitor CLI**         | según `package.json`                     | `npx cap ...`                                                                                                                                              |

> El wrapper `android/gradlew` se versiona con bit ejecutable (`100755`). Si al clonar
> en Unix apareciera como no ejecutable, restáuralo con
> `git update-index --chmod=+x android/gradlew`.

## Build de la app (web → nativo)

Desde la raíz del repositorio:

```bash
# 1. Build web en modo mobile + sync a la carpeta android/
npm run android:sync        # = vite build --mode mobile && npx cap sync android

# 2. Compilar el AAB firmado de release
cd android
./gradlew bundleRelease      # AAB en android/app/build/outputs/bundle/release/
# o el APK:
./gradlew assembleRelease
```

## Firma (release)

La firma se lee de `android/keystore.properties` (**no versionado**, ver `.gitignore`).
Formato:

```properties
storeFile=/ruta/al/keystore.jks
storePassword=****
keyAlias=****
keyPassword=****
```

Sin ese fichero, `bundleRelease`/`assembleRelease` compilan **sin firmar**
(el bloque `signingConfig` solo se aplica si `hasKeystore`).

## Versionado (fuente única)

`versionCode` y `versionName` se definen en **`android/gradle.properties`**
(`appVersionCode`, `appVersionName`) y `app/build.gradle` los lee de ahí. Para un
release concreto, sobreescribe sin tocar ficheros:

```bash
./gradlew bundleRelease -PappVersionCode=2 -PappVersionName=1.0.1
```

Política: incrementar `appVersionCode` en cada subida a Play Console (entero
monótono) y `appVersionName` con SemVer visible al usuario. Mantener sincronizado
con la versión web/API cuando se etiquete un release.

## Automatización actual

- `.github/workflows/android.yml` compila el AAB con Node 22 y JDK 21 en cada cambio
  móvil relevante de `main` y permite firma mediante secretos de GitHub.
- El 2026-07-18 se publicó en Google Play `internal` el AAB firmado
  `versionName=1.0.1`, `versionCode=2` para `com.entrenaconia.app`.
- iOS requiere Xcode + archive y se publica posteriormente desde macOS.
