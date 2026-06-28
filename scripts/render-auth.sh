#!/bin/bash
# Script para autenticación de Render CLI en WSL

echo "========================================"
echo "   🔐 Autenticación de Render CLI"
echo "========================================"
echo ""

# Verificar que render CLI está instalado
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI no está instalado"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
CONFIG_DIR="$PROJECT_ROOT/.render"
CONFIG_FILE="$CONFIG_DIR/cli.yaml"

mkdir -p "$CONFIG_DIR"
export RENDER_CLI_CONFIG_PATH="$CONFIG_FILE"

if [ -n "${RENDER_API_KEY:-}" ]; then
    export RENDER_API_KEY="$RENDER_API_KEY"
elif [ -n "${RENDER_MCP_BEARER_TOKEN:-}" ]; then
    export RENDER_API_KEY="$RENDER_MCP_BEARER_TOKEN"
fi

if [ -f "$ENV_FILE" ]; then
    TOKEN_LINE="$(grep -m1 -E '^(RENDER_API_KEY|RENDER_MCP_BEARER_TOKEN)=' "$ENV_FILE" || true)"
    WORKSPACE_LINE="$(grep -m1 -E '^(RENDER_WORKSPACE_ID|RENDER_WORKSPACE_NAME)=' "$ENV_FILE" || true)"
    if [ -z "${RENDER_API_KEY:-}" ] && [ -n "$TOKEN_LINE" ]; then
        export RENDER_API_KEY="${TOKEN_LINE#*=}"
    fi
fi

if [ -z "${WORKSPACE_LINE:-}" ]; then
    if [ -n "${RENDER_WORKSPACE_ID:-}" ]; then
        WORKSPACE_LINE="RENDER_WORKSPACE_ID=${RENDER_WORKSPACE_ID}"
    elif [ -n "${RENDER_WORKSPACE_NAME:-}" ]; then
        WORKSPACE_LINE="RENDER_WORKSPACE_NAME=${RENDER_WORKSPACE_NAME}"
    fi
fi

if [ -n "${RENDER_API_KEY:-}" ]; then
    if [ -n "${WORKSPACE_LINE:-}" ]; then
        render workspace set "${WORKSPACE_LINE#*=}" --confirm --output text >/dev/null 2>&1 || true
    fi
    echo "Usando credencial de Render desde entorno o .env"
    echo ""
    render whoami --output text
    exit $?
fi

echo "Generando código de autorización..."
echo ""

# Ejecutar render login y capturar la salida
export PATH=$PATH:/home/sergio/.local/bin
render login 2>&1 | tee /tmp/render-login.log

echo ""
echo "========================================"
echo "📋 INSTRUCCIONES:"
echo "========================================"
echo ""
echo "1. Busca arriba el código que empieza con letras y números (ej: 6I7R-VH5H-MN2B-GUEW)"
echo "2. Busca la URL que empieza con https://dashboard.render.com/device-authorization/"
echo "3. Abre esa URL en tu navegador de Windows"
echo "4. Ingresa el código cuando te lo pida"
echo "5. Autoriza la aplicación"
echo ""
echo "✅ Una vez autorizado, la CLI detectará automáticamente el login"
echo ""
