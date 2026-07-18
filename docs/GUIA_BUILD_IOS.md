# Guía de build iOS (Capacitor)

Fecha: 2026-07-07
Requisito previo: leer `docs/DECISION_ARQUITECTURA_MOVIL_FLUTTER_VS_CAPACITOR.md`.

## Qué hay ya en el repositorio

- `ios/` — proyecto nativo Xcode generado con `npx cap add ios` (Capacitor 8, usa **Swift Package Manager**, no requiere CocoaPods).
- Bundle ID: `com.entrenaconia.app` · Nombre visible: "MindFit" · Target mínimo: iOS 15.0.
- `ios/App/App/Info.plist` con los permisos que necesita corrección de vídeo:
  - `NSCameraUsageDescription` (grabar ejercicios con `getUserMedia`)
  - `NSMicrophoneUsageDescription`
  - `NSPhotoLibraryUsageDescription` (subir vídeos desde la fototeca)
  - `NSPhotoLibraryAddUsageDescription`
- `.env.production` apunta el build al backend de Render (`VITE_API_URL=https://entrenaconia.onrender.com`), igual que en Android.
- `CapacitorHttp` activado en `capacitor.config.json` (HTTP nativo, sin CORS).
- Los assets web copiados (`ios/App/App/public`) están gitignorados; se regeneran con `cap sync`.

## Scripts npm

```bash
npm run ios:sync      # build web (Vite, modo production) + sincroniza al proyecto iOS
npm run ios:open      # abre el proyecto en Xcode (solo macOS)
npm run mobile:sync   # build + sync de Android e iOS a la vez
```

## Compilar y probar (requiere un Mac con Xcode 15+)

1. Clonar el repo y ejecutar `npm install`.
2. `npm run ios:sync`
3. `npm run ios:open` (o abrir `ios/App/App.xcodeproj` en Xcode).
4. En _Signing & Capabilities_: seleccionar tu equipo del Apple Developer Program
   (la cuenta de pago, 99 €/año, es imprescindible para TestFlight/App Store).
5. Ejecutar en simulador o dispositivo (⌘R).
   - La cámara NO existe en el simulador: probar corrección de vídeo en un iPhone real.

## Publicar en el App Store

1. En Xcode: _Product → Archive_ con un dispositivo genérico "Any iOS Device (arm64)".
2. _Distribute App → App Store Connect → Upload_.
3. En [App Store Connect](https://appstoreconnect.apple.com): crear la app con el
   bundle ID `com.entrenaconia.app`, adjuntar el build, subir capturas y ficha.
4. Probar primero por **TestFlight** antes de enviar a revisión.
5. Revisión de Apple: como la app tiene cuentas de usuario, exigen una **cuenta demo**
   en la ficha de revisión y un enlace a la política de privacidad.

## Checklist de verificación en dispositivo

- [ ] Login y persistencia de sesión tras cerrar y reabrir la app.
- [ ] Generación de rutina (llamadas al backend de Render, no a `localhost`).
- [ ] Corrección de vídeo: grabar con cámara (pide permiso la 1ª vez) y subir desde fototeca.
- [ ] Reproductor de música/audio durante la sesión.
- [ ] Modales y navegación inferior sin recortes (mismo fix de z-index que Android)
      y respeto del _safe area_ (notch/Dynamic Island).

## Versionado

La versión visible (`MARKETING_VERSION`, hoy 1.0) y el número de build
(`CURRENT_PROJECT_VERSION`) se gestionan en Xcode (target App → General),
igual que `versionName`/`versionCode` en Android. Cada subida a App Store
Connect debe incrementar el número de build.
