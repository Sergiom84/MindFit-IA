#!/bin/bash
# Script para configurar el workspace de Render CLI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
CONFIG_DIR="$PROJECT_ROOT/.render"
CONFIG_FILE="$CONFIG_DIR/cli.yaml"

export PATH=$PATH:/home/sergio/.local/bin
mkdir -p "$CONFIG_DIR"
export RENDER_CLI_CONFIG_PATH="$CONFIG_FILE"

if [ -n "${RENDER_API_KEY:-}" ]; then
    export RENDER_API_KEY="$RENDER_API_KEY"
elif [ -n "${RENDER_MCP_BEARER_TOKEN:-}" ]; then
    export RENDER_API_KEY="$RENDER_MCP_BEARER_TOKEN"
fi

if [ -f "$ENV_FILE" ]; then
    TOKEN_LINE="$(grep -m1 -E '^(RENDER_API_KEY|RENDER_MCP_BEARER_TOKEN)=' "$ENV_FILE" || true)"
    if [ -z "${RENDER_API_KEY:-}" ] && [ -n "$TOKEN_LINE" ]; then
        export RENDER_API_KEY="${TOKEN_LINE#*=}"
    fi
fi

echo "========================================"
echo "   🏢 Configurar Workspace de Render"
echo "========================================"
echo ""

echo "Verificando autenticación..."
render whoami --output text 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ Error: No estás autenticado correctamente"
    echo "Revisa RENDER_API_KEY/RENDER_MCP_BEARER_TOKEN o ejecuta npm run render:auth"
    exit 1
fi

echo ""
echo "✅ Autenticación verificada"
echo ""
WORKSPACE_LINE=""
if [ -n "${RENDER_WORKSPACE_ID:-}" ]; then
    WORKSPACE_LINE="RENDER_WORKSPACE_ID=${RENDER_WORKSPACE_ID}"
elif [ -n "${RENDER_WORKSPACE_NAME:-}" ]; then
    WORKSPACE_LINE="RENDER_WORKSPACE_NAME=${RENDER_WORKSPACE_NAME}"
elif [ -f "$ENV_FILE" ]; then
    WORKSPACE_LINE="$(grep -m1 -E '^(RENDER_WORKSPACE_ID|RENDER_WORKSPACE_NAME)=' "$ENV_FILE" || true)"
fi
if [ -n "$WORKSPACE_LINE" ]; then
    render workspace set "${WORKSPACE_LINE#*=}" --confirm --output text
    echo ""
    echo "✅ Workspace local del proyecto configurado en $CONFIG_FILE"
else
    echo "No se encontró RENDER_WORKSPACE_ID ni RENDER_WORKSPACE_NAME en entorno o .env"
    echo "Añade una de esas variables y vuelve a ejecutar este script."
fi
