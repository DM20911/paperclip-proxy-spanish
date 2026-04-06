#!/usr/bin/env bash
# start.sh — Lanzador de Paperclip
# Pregunta en qué puerto abrir y configura el proxy de español si corresponde.

set -euo pipefail

INSTANCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_PLIST="$HOME/Library/LaunchAgents/com.paperclip.spanish-ui-proxy.plist"
PROXY_PORT=3101
PAPERCLIP_PORT=3100

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│           Iniciar Paperclip             │"
echo "├─────────────────────────────────────────┤"
echo "│  [1]  :3100  Estándar (inglés)          │"
echo "│  [2]  :3101  Con traducción al español  │"
echo "└─────────────────────────────────────────┘"
echo ""
printf "Elige (1 o 2) [2]: "
read -r opcion
opcion="${opcion:-2}"

case "$opcion" in
  1)
    echo ""
    echo "→ Iniciando en http://localhost:${PAPERCLIP_PORT}"
    open "http://localhost:${PAPERCLIP_PORT}" 2>/dev/null &
    ;;
  2)
    echo ""

    # Verificar que el plist existe
    if [[ ! -f "$PROXY_PLIST" ]]; then
      echo "⚠  Proxy no instalado. Ejecuta primero:"
      echo "   bash $INSTANCE_DIR/plugins/spanish-ui/setup.sh"
      echo ""
      echo "Abriendo en :${PAPERCLIP_PORT} como respaldo..."
      open "http://localhost:${PAPERCLIP_PORT}" 2>/dev/null &
    else
      # Asegurar que el proxy está corriendo
      if ! launchctl list 2>/dev/null | grep -q "com.paperclip.spanish-ui-proxy"; then
        echo "→ Iniciando proxy de traducción..."
        launchctl load "$PROXY_PLIST" 2>/dev/null
        sleep 1
      fi

      # Esperar a que el proxy responda (hasta 5s)
      echo "→ Verificando proxy en :${PROXY_PORT}..."
      for i in 1 2 3 4 5; do
        if curl -s --max-time 1 "http://localhost:${PROXY_PORT}/" > /dev/null 2>&1; then
          break
        fi
        sleep 1
      done

      if curl -s --max-time 1 "http://localhost:${PROXY_PORT}/" > /dev/null 2>&1; then
        echo "→ Proxy activo. Abriendo http://localhost:${PROXY_PORT}"
        open "http://localhost:${PROXY_PORT}" 2>/dev/null &
      else
        echo "⚠  Proxy no responde. Abriendo en :${PAPERCLIP_PORT} como respaldo."
        open "http://localhost:${PAPERCLIP_PORT}" 2>/dev/null &
      fi
    fi
    ;;
  *)
    echo "Opción inválida. Saliendo."
    exit 1
    ;;
esac

echo ""
echo "Iniciando servidor Paperclip en :${PAPERCLIP_PORT} (Ctrl+C para detener)..."
echo ""

npm exec paperclipai onboard --yes
