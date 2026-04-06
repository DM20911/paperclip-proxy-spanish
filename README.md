# Paperclip — Proxy UI en Español

Fork de [paperclipai/paperclip](https://github.com/paperclipai/paperclip) con un proxy de traducción que convierte toda la interfaz de usuario al **español**, sin modificar el código fuente de Paperclip.

---

## ¿Qué agrega este fork?

Este fork incluye un plugin de traducción en `plugins/spanish-ui/` que:

- Intercepta las respuestas de Paperclip antes de llegar al browser
- Parchea el bundle de JavaScript reemplazando strings de UI (`children:`, `label:`, `placeholder:`) directamente en React — **React renderiza en español desde el primer render**
- Inyecta un traductor DOM como respaldo para texto dinámico
- **No modifica el código fuente de Paperclip** — es una capa completamente separada

### Archivos agregados

```
plugins/spanish-ui/
├── proxy.mjs              # Servidor proxy Node.js (puerto 3101)
├── translations-es.js     # Mapa de traducciones inglés → español
├── injected-translator.js # Traductor DOM para texto dinámico
├── package.json
└── setup.sh               # Instalador automático (macOS)
start.sh                   # Lanzador de Paperclip
CLAUDE.md                  # Instrucciones globales en español para agentes IA
```

---

## Instalación

### Requisitos

- Node.js 18+
- macOS (el `setup.sh` usa `launchd`; en Linux adaptar a `systemd`)

### 1. Instalar Paperclip

```bash
npm exec paperclipai onboard --yes
```

Paperclip corre en `http://localhost:3100`.

### 2. Instalar el proxy de traducción

```bash
bash plugins/spanish-ui/setup.sh
```

El script detecta Node.js automáticamente, registra el proxy como servicio del sistema (inicio automático) y lo deja disponible en `http://localhost:3101`.

### 3. Abrir Paperclip en español

```
http://localhost:3101
```

---

## Cómo funciona

```
Browser → :3101 (proxy) → :3100 (Paperclip)
              ↓
  Al arrancar, descarga el bundle JS y reemplaza
  strings de UI en contexto React:
    children:"Dashboard"  →  children:"Panel principal"
    label:"Settings"      →  label:"Configuración"
  Sirve el bundle parcheado desde caché en memoria.
```

El proxy distingue entre strings de display y strings de código:
- `children:"Dashboard"` → traduce ✓
- `status === "active"` → no toca ✓

---

## Agregar traducciones

Edita `plugins/spanish-ui/translations-es.js` y reinicia el proxy:

```bash
launchctl unload ~/Library/LaunchAgents/com.paperclip.spanish-ui-proxy.plist
launchctl load   ~/Library/LaunchAgents/com.paperclip.spanish-ui-proxy.plist
```

---

## Agentes en español

`CLAUDE.md` instruye a todos los agentes de Paperclip a comunicarse en español. Se aplica automáticamente a agentes actuales y futuros.

---

## Actualizar desde upstream

```bash
git remote add upstream https://github.com/paperclipai/paperclip.git
git fetch upstream
git merge upstream/master
```

Los archivos de traducción están en `plugins/spanish-ui/` — separados del código de Paperclip — por lo que los merges no generan conflictos.

---

## Licencia

El código original de Paperclip mantiene su licencia. Los archivos en `plugins/spanish-ui/` y `start.sh` son contribución propia bajo MIT.
