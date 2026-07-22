#!/bin/bash
# Script para configurar API Key de Render

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
CONFIG_DIR="$PROJECT_ROOT/.render"
CONFIG_FILE="$CONFIG_DIR/cli.yaml"

mkdir -p "$CONFIG_DIR"
export RENDER_CLI_CONFIG_PATH="$CONFIG_FILE"

echo "========================================"
echo "   🔑 Configurar Render API Key"
echo "========================================"
echo ""
echo "Obtén tu API Key en:"
echo "https://dashboard.render.com/u/settings#api-keys"
echo ""
echo "La credencial se guardará solo en este proyecto: $ENV_FILE"
echo ""
echo -n "Ingresa tu API Key: "
read -s API_KEY
echo ""

if [ -z "$API_KEY" ]; then
    echo "❌ No ingresaste ninguna API Key"
    exit 1
fi

touch "$ENV_FILE"

if grep -q '^RENDER_API_KEY=' "$ENV_FILE"; then
    sed -i "s|^RENDER_API_KEY=.*|RENDER_API_KEY=$API_KEY|" "$ENV_FILE"
elif grep -q '^RENDER_MCP_BEARER_TOKEN=' "$ENV_FILE"; then
    sed -i "s|^RENDER_MCP_BEARER_TOKEN=.*|RENDER_MCP_BEARER_TOKEN=$API_KEY|" "$ENV_FILE"
else
    echo "RENDER_MCP_BEARER_TOKEN=$API_KEY" >> "$ENV_FILE"
fi

export RENDER_API_KEY="$API_KEY"

WORKSPACE_LINE="$(grep -m1 -E '^(RENDER_WORKSPACE_ID|RENDER_WORKSPACE_NAME)=' "$ENV_FILE" || true)"
if [ -n "$WORKSPACE_LINE" ]; then
    render workspace set "${WORKSPACE_LINE#*=}" --confirm --output text >/dev/null 2>&1 || true
fi

echo ""
echo "✅ API Key configurada correctamente en .env"
echo ""
echo "Verificando autenticación..."
render whoami

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 ¡Login exitoso con API Key!"
else
    echo ""
    echo "❌ Error: La API Key no parece ser válida"
    echo "Verifica que la copiaste correctamente"
fi
