#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Build + archive + export + upload de la app iOS (Entrena con IA) a App Store.
#
# Firma vía API Key de App Store Connect (compartida por la cuenta, team P92L2CBRM2).
# No requiere Apple ID conectado en Xcode: -allowProvisioningUpdates crea el
# certificado de distribución y el perfil automáticamente usando la key.
#
# Requisitos previos (una sola vez):
#   1. App creada en App Store Connect con bundle id  com.entrenaconia.app
#   2. Key .p8 presente en ~/.appstoreconnect/private_keys/AuthKey_7Y3F6VFK7T.p8
#
# Uso:   bash scripts/ios-archive-upload.sh
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="ios/App/App.xcodeproj"
SCHEME="App"
ARCHIVE="build/EntrenaconIA.xcarchive"
EXPORT_DIR="build/ipa"
TEAM="P92L2CBRM2"

# --- App Store Connect API key (autodescubierta por Key ID en ~/.appstoreconnect) ---
ASC_KEY_ID="${ASC_KEY_ID:-7Y3F6VFK7T}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-9661d3a6-5f6b-4814-9431-07134d834a31}"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"

AUTH=( -allowProvisioningUpdates
       -authenticationKeyPath "$ASC_KEY_PATH"
       -authenticationKeyID "$ASC_KEY_ID"
       -authenticationKeyIssuerID "$ASC_ISSUER_ID" )

echo "==> 1/5  Build web (Vite, producción) + Capacitor sync iOS"
npm run ios:sync

echo "==> 2/5  Archive (Release, Any iOS Device)"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -sdk iphoneos -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" archive \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" \
  "${AUTH[@]}"

echo "==> 3/5  Export IPA firmado para App Store"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist ios/ExportOptions.plist \
  "${AUTH[@]}"

IPA="$(find "$EXPORT_DIR" -name '*.ipa' | head -1)"
echo "    IPA: $IPA"

echo "==> 4/5  Validar contra App Store Connect"
xcrun altool --validate-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> 5/5  Subir a App Store Connect"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "==> Hecho. Revisa el build en App Store Connect → TestFlight."
