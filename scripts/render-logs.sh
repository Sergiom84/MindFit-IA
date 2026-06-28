#!/bin/bash
# Script de acceso rápido a logs de Render
# Uso: ./render-logs.sh [servicio] [opciones]

# Colores para mejor legibilidad
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Render Logs - Entrena con IA${NC}\n"

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

# Verificar que render CLI está instalado
if ! command -v render &> /dev/null; then
    echo -e "${RED}❌ Render CLI no está instalado${NC}"
    echo "Instala con: curl -fsSL https://raw.githubusercontent.com/render-oss/cli/refs/heads/main/bin/install.sh | sh"
    exit 1
fi

# Cargar token local del proyecto si existe
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

if [ -n "${WORKSPACE_LINE:-}" ]; then
    render workspace set "${WORKSPACE_LINE#*=}" --confirm --output text >/dev/null 2>&1 || true
fi

# Verificar autenticación
if ! render whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  No estás autenticado en Render${NC}"
    echo -e "Revisa ${GREEN}RENDER_API_KEY${NC}/${GREEN}RENDER_MCP_BEARER_TOKEN${NC} o ejecuta ${GREEN}npm run render:auth${NC}"
    exit 1
fi

# Función para mostrar ayuda
show_help() {
    echo "Uso: $0 [comando] [opciones]"
    echo ""
    echo "Comandos disponibles:"
    echo "  list              - Listar todos los servicios"
    echo "  tail [servicio]   - Ver logs en tiempo real (streaming)"
    echo "  view [servicio]   - Ver últimos logs (100 líneas)"
    echo "  errors [servicio] - Filtrar solo errores"
    echo ""
    echo "Opciones generales:"
    echo "  --limit N         - Número de líneas a mostrar (default: 100)"
    echo "  --start TIME      - Desde cuándo ver logs"
    echo "  --end TIME        - Hasta cuándo ver logs"
    echo "  --text STRING     - Buscar texto específico"
    echo ""
    echo "Ejemplos:"
    echo "  $0 list"
    echo "  $0 tail backend"
    echo "  $0 view backend --limit 500"
    echo "  $0 errors backend"
}

# Si no hay argumentos, mostrar ayuda
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

COMMAND=$1
shift

case $COMMAND in
    list)
        echo -e "${GREEN}🔍 Listando servicios...${NC}\n"
        render services --output text
        ;;

    tail)
        SERVICE=$1
        shift
        echo -e "${GREEN}📡 Streaming logs de: $SERVICE${NC}"
        echo -e "${YELLOW}Presiona Ctrl+C para salir${NC}\n"
        render logs --resources "$SERVICE" --tail "$@"
        ;;

    view)
        SERVICE=$1
        shift
        LIMIT=${1:-100}
        echo -e "${GREEN}📋 Últimos $LIMIT logs de: $SERVICE${NC}\n"
        render logs --resources "$SERVICE" --limit "$LIMIT" --output text "$@"
        ;;

    errors)
        SERVICE=$1
        shift
        echo -e "${RED}🚨 Filtrando errores de: $SERVICE${NC}\n"
        render logs --resources "$SERVICE" --level error --limit 200 --output text "$@"
        ;;

    *)
        echo -e "${RED}❌ Comando desconocido: $COMMAND${NC}\n"
        show_help
        exit 1
        ;;
esac
