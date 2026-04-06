#!/usr/bin/env bash
# setup.sh — Instala el proxy de traducción al español en macOS
# Ejecutar una vez después de clonar el repo o reinstalar Paperclip.
# Uso: bash setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.paperclip.spanish-ui-proxy"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

# Detectar node
NODE_BIN="$(which node 2>/dev/null || echo '')"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: No se encontró Node.js. Instálalo con: brew install node"
  exit 1
fi

echo "→ Node.js encontrado en: $NODE_BIN"

# Generar el plist con la ruta correcta de node y del proxy
cat > "$PLIST_DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_NAME</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SCRIPT_DIR/proxy.mjs</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$SCRIPT_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PROXY_PORT</key>
    <string>3101</string>
    <key>PAPERCLIP_PORT</key>
    <string>3100</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$HOME/.paperclip/instances/default/logs/spanish-ui-proxy.log</string>

  <key>StandardErrorPath</key>
  <string>$HOME/.paperclip/instances/default/logs/spanish-ui-proxy.err.log</string>
</dict>
</plist>
EOF

echo "→ Plist generado en: $PLIST_DEST"

# Descargar si ya estaba cargado
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Cargar
launchctl load "$PLIST_DEST"
sleep 1

# Verificar
if launchctl list | grep -q "$PLIST_NAME"; then
  echo ""
  echo "✓ Proxy de traducción instalado y corriendo."
  echo ""
  echo "  Accede a Paperclip en: http://localhost:3101"
  echo "  (usa este puerto en lugar de :3100)"
  echo ""
  echo "  Para agregar traducciones o modificarlas, edita:"
  echo "  $SCRIPT_DIR/translations-es.js"
  echo "  y recarga el browser."
else
  echo "ERROR: El proxy no pudo iniciarse. Revisa los logs en:"
  echo "  $HOME/.paperclip/instances/default/logs/spanish-ui-proxy.err.log"
  exit 1
fi
