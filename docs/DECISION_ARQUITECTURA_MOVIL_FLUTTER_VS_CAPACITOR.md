# Decisión de arquitectura móvil: ¿Flutter o mantener React + Capacitor?

Fecha: 2026-07-07
Estado: análisis y recomendación

## Contexto del repositorio (datos medidos)

- Frontend: React 19 + Vite, **269 ficheros / ~83.000 líneas** en `src/`.
- Backend: Node/Express, **203 ficheros / ~61.000 líneas** en `backend/`, desplegado en Render, BD en Supabase.
- **Capacitor 8 ya está instalado y configurado**: existe `capacitor.config.json` (`appId: com.entrenaconia.app`) y el proyecto nativo `android/` generado. Falta la plataforma iOS (`npx cap add ios`).
- El código no usa todavía plugins nativos de Capacitor en `src/` (solo `CapacitorHttp` en config). Las funciones "nativas" actuales (cámara para corrección de vídeo, subida de vídeo) usan APIs web estándar (`getUserMedia`, `<input type="file">`), que funcionan dentro del WebView de Capacitor en Android e iOS.

## Opciones evaluadas

### Opción A — Reescribir todo en Flutter
- Habría que reescribir ~83.000 líneas de React en Dart: pantallas, providers/contextos (Auth, User, Workout, Trace), formularios, gráficas (recharts), animaciones (framer-motion), etc.
- El backend Node no cambia en ningún escenario: Flutter solo sustituye el frontend.
- Se pierde la versión web (Flutter Web existe pero es débil para una app con tanto contenido tipo documento/formulario) o se mantienen **dos frontends** para siempre.
- Estimación realista para una persona: varios meses solo para llegar a paridad funcional, sin ninguna funcionalidad nueva durante ese tiempo, y con congelación parcial del producto.
- Beneficio real: rendimiento de UI algo mejor y look nativo. Ninguna funcionalidad de la app actual lo exige (no hay cómputo pesado en el dispositivo: la IA corre en el backend con OpenAI/Anthropic).

### Opción B — Nativo por separado (Kotlin + Swift)
- Tres bases de código (web + Android + iOS) para un equipo de una persona. Cada feature se implementa tres veces. Descartada sin más análisis.

### Opción C — Seguir con React + Capacitor (camino ya empezado) ✅
- Una sola base de código sirve web, Android e iOS.
- El trabajo Android ya está hecho en gran parte (`android/` existe). Para iOS: `npx cap add ios` + un Mac con Xcode para compilar y publicar (requisito de Apple, aplica igual a Flutter).
- La cámara de corrección de vídeo funciona en el WebView de iOS (WKWebView soporta `getUserMedia` desde iOS 14.3) declarando permisos en `Info.plist`; en Android ya funciona con los permisos del manifest.
- Si en el futuro hace falta algo realmente nativo (notificaciones push, salud/HealthKit, background audio), hay plugin de Capacitor oficial o comunitario para cada caso.

## Recomendación

**Opción C: no migrar a Flutter.** Mantener React + Capacitor y completar la plataforma iOS.

Motivos principales:
1. La inversión existente (~83k líneas de frontend probado en producción) se conserva íntegra; una migración a Flutter la tira a la basura sin aportar ninguna capacidad que la app necesite hoy.
2. Capacitor ya está integrado: el coste de llegar a Android + iOS es días, no meses.
3. La app es de tipo contenido/formularios/gráficas con IA en servidor — el caso ideal de webview híbrido. Flutter compensa cuando hay UI de altísima exigencia (animaciones 60fps complejas, cómputo en dispositivo), que no es el caso.
4. Un solo stack (JS) para todo simplifica mantenimiento para un equipo pequeño.

## Cuándo reconsiderar Flutter

- Si se decidiera hacer análisis de vídeo/pose **en el dispositivo** en tiempo real (ML on-device) y el WebView se quedara corto.
- Si se abandonara la versión web y la app pasara a ser exclusivamente móvil con requisitos de UI nativa.

## Próximos pasos sugeridos (no incluidos en esta rama)

1. `npx cap add ios` y configurar permisos de cámara/micrófono en `Info.plist`.
2. Revisar que las URLs del API usan la base de producción (Render) cuando corre dentro de Capacitor (no `localhost`).
3. Probar el flujo de corrección de vídeo dentro del WebView Android/iOS.
4. Añadir `@capacitor/push-notifications` si se quieren notificaciones.
