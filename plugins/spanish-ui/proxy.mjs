/**
 * Proxy de traducción para Paperclip UI
 *
 * Estrategia:
 *  1. Al arrancar, descarga todos los assets JS de Paperclip.
 *  2. Parchea SOLO strings en contexto UI: children:"text" y label:"text"
 *     (nunca toca strings de código como status==="active").
 *  3. Guarda todo en memoria. Los requests JS se sirven desde caché estático.
 *  4. Inyecta un script DOM mínimo como respaldo para texto completamente dinámico.
 *
 * Resultado: React carga ya en español. Sin flashes, sin MutationObserver luchando.
 *
 * Uso:  node proxy.mjs
 * URL:  http://localhost:3101
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROXY_PORT     = parseInt(process.env.PROXY_PORT     || '3101', 10);
const PAPERCLIP_HOST = process.env.PAPERCLIP_HOST          || '127.0.0.1';
const PAPERCLIP_PORT = parseInt(process.env.PAPERCLIP_PORT || '3100', 10);

// ─── Cargar traducciones ──────────────────────────────────────────────────────

const TRANSLATIONS = (() => {
  const raw = readFileSync(path.join(__dirname, 'translations-es.js'), 'utf8');
  const match = raw.match(/const TRANSLATIONS\s*=\s*(\{[\s\S]*?\n\};)/);
  if (!match) throw new Error('No se pudo parsear translations-es.js');
  // eslint-disable-next-line no-eval
  return eval('(' + match[1].replace(/\n\};$/, '\n}') + ')');
})();

// Ordenar por longitud desc (frases largas primero)
const SORTED = Object.entries(TRANSLATIONS).sort((a, b) => b[0].length - a[0].length);

// ─── Parchear JS de forma quirúrgica ─────────────────────────────────────────

/**
 * Solo reemplaza strings en contextos de display text:
 *   children:"Dashboard"  →  children:"Panel principal"
 *   label:"Dashboard"     →  label:"Panel principal"
 *   label:'Dashboard'     →  label:'Panel principal'
 *
 * NO toca strings fuera de estos contextos, preservando toda la lógica de React.
 */
function patchJs(js) {
  let result = js;
  for (const [en, es] of SORTED) {
    if (en === es) continue;
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // children:"texto" y children:'texto'
    result = result
      .replace(new RegExp(`(children:)"${esc}"`, 'g'), `$1"${es}"`)
      .replace(new RegExp(`(children:)'${esc}'`, 'g'), `$1'${es}'`);

    // label:"texto" y label:'texto'
    result = result
      .replace(new RegExp(`(label:)"${esc}"`, 'g'), `$1"${es}"`)
      .replace(new RegExp(`(label:)'${esc}'`, 'g'), `$1'${es}'`);

    // placeholder:"texto"
    result = result
      .replace(new RegExp(`(placeholder:)"${esc}"`, 'g'), `$1"${es}"`)
      .replace(new RegExp(`(placeholder:)'${esc}'`, 'g'), `$1'${es}'`);

    // title:"texto" (solo cuando es prop de JSX, no document.title)
    result = result
      .replace(new RegExp(`(title:)"${esc}"`, 'g'), `$1"${es}"`)
      .replace(new RegExp(`(title:)'${esc}'`, 'g'), `$1'${es}'`);
  }
  return result;
}

// ─── Script DOM de respaldo (para texto dinámico que no viene del bundle) ─────

const translationsScript = readFileSync(path.join(__dirname, 'translations-es.js'), 'utf8');
const translatorScript   = readFileSync(path.join(__dirname, 'injected-translator.js'), 'utf8');

const INJECT_SCRIPT = `<script>
/* Paperclip ES — respaldo DOM */
${translationsScript}
${translatorScript}
</script>`;

// ─── Fetch interno ────────────────────────────────────────────────────────────

function fetchFromPaperclip(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: PAPERCLIP_HOST, port: PAPERCLIP_PORT, path: urlPath, method: 'GET' },
      (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const enc = res.headers['content-encoding'];
          const body = enc === 'gzip'    ? zlib.gunzipSync(raw)
                     : enc === 'deflate' ? zlib.inflateSync(raw)
                     : enc === 'br'      ? zlib.brotliDecompressSync(raw)
                     : raw;
          resolve({ body, headers: res.headers, status: res.statusCode });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ─── Caché de assets parcheados ───────────────────────────────────────────────

// url → { buffer, contentType }
const assetCache = new Map();

async function warmCache() {
  console.log('[proxy] Descargando y parcheando assets de Paperclip...');

  // 1. Descargar HTML para encontrar las URLs de los assets JS
  const { body: htmlBuf } = await fetchFromPaperclip('/');
  const html = htmlBuf.toString('utf8');

  // Extraer URLs de scripts y CSS del HTML
  const scriptUrls = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  const cssUrls    = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map(m => m[1]);

  console.log(`[proxy] Assets encontrados: ${scriptUrls.length} JS, ${cssUrls.length} CSS`);

  // 2. Descargar, parchear y cachear cada JS
  for (const url of scriptUrls) {
    try {
      const { body, headers } = await fetchFromPaperclip(url);
      const original = body.toString('utf8');
      const patched  = patchJs(original);
      const buf      = Buffer.from(patched, 'utf8');
      assetCache.set(url, { buffer: buf, contentType: headers['content-type'] || 'application/javascript' });

      const changed = (original !== patched)
        ? `${(original.length - patched.length > 0 ? '-' : '+')}${Math.abs(original.length - patched.length)} chars`
        : 'sin cambios';
      console.log(`[proxy]   ✓ ${url} (${Math.round(buf.byteLength / 1024)}kb, ${changed})`);
    } catch (e) {
      console.error(`[proxy]   ✗ ${url}: ${e.message}`);
    }
  }

  // 3. Cachear CSS sin modificar
  for (const url of cssUrls) {
    try {
      const { body, headers } = await fetchFromPaperclip(url);
      assetCache.set(url, { buffer: body, contentType: headers['content-type'] || 'text/css' });
    } catch (e) {
      console.error(`[proxy]   ✗ ${url}: ${e.message}`);
    }
  }

  // 4. Parchear y cachear el HTML
  const patchedHtml = Buffer.from(
    html.replace('</head>', INJECT_SCRIPT + '</head>'),
    'utf8'
  );
  assetCache.set('/__html__', { buffer: patchedHtml, contentType: 'text/html; charset=utf-8' });

  console.log(`[proxy] Cache listo. ${assetCache.size} assets precargados.\n`);
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

function decompress(buffer, encoding) {
  if (encoding === 'gzip')    return zlib.gunzipSync(buffer);
  if (encoding === 'deflate') return zlib.inflateSync(buffer);
  if (encoding === 'br')      return zlib.brotliDecompressSync(buffer);
  return buffer;
}

const server = http.createServer((clientReq, clientRes) => {
  const url = clientReq.url;

  // Servir HTML parcheado desde caché solo para rutas de la SPA (no API)
  const isSpaRoute = (url === '/' || url === '/index.html')
    || (!url.startsWith('/api/') && !url.startsWith('/assets/') && !url.includes('.'));
  if (isSpaRoute) {
    const cached = assetCache.get('/__html__');
    if (cached) {
      clientRes.writeHead(200, {
        'content-type': cached.contentType,
        'content-length': String(cached.buffer.byteLength),
        'cache-control': 'no-store',
      });
      clientRes.end(cached.buffer);
      return;
    }
  }

  // Servir JS/CSS parcheado desde caché
  if (assetCache.has(url)) {
    const cached = assetCache.get(url);
    clientRes.writeHead(200, {
      'content-type': cached.contentType,
      'content-length': String(cached.buffer.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
    });
    clientRes.end(cached.buffer);
    return;
  }

  // Todo lo demás (API, WebSocket HTTP, otros) → proxy directo
  const headers = { ...clientReq.headers, host: `${PAPERCLIP_HOST}:${PAPERCLIP_PORT}` };
  delete headers['accept-encoding'];

  const proxyReq = http.request(
    { hostname: PAPERCLIP_HOST, port: PAPERCLIP_PORT, path: url,
      method: clientReq.method, headers },
    (proxyRes) => {
      const ct  = proxyRes.headers['content-type'] || '';
      const enc = proxyRes.headers['content-encoding'];

      // Si es HTML no cacheado, parchear al vuelo
      if (ct.includes('text/html')) {
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          let buf = Buffer.concat(chunks);
          if (enc) buf = decompress(buf, enc);
          const patched = Buffer.from(
            buf.toString('utf8').replace('</head>', INJECT_SCRIPT + '</head>'),
            'utf8'
          );
          const h = { ...proxyRes.headers, 'content-length': String(patched.byteLength) };
          delete h['content-encoding'];
          clientRes.writeHead(proxyRes.statusCode, h);
          clientRes.end(patched);
        });
        return;
      }

      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    clientRes.writeHead(502);
    clientRes.end(`Error: ${err.message}`);
  });

  clientReq.pipe(proxyReq, { end: true });
});

// WebSocket pass-through
server.on('upgrade', (req, socket) => {
  const proxyReq = http.request({
    hostname: PAPERCLIP_HOST, port: PAPERCLIP_PORT,
    path: req.url, headers: req.headers,
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

// ─── Arranque ─────────────────────────────────────────────────────────────────

warmCache().then(() => {
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`╔══════════════════════════════════════════╗`);
    console.log(`║  Paperclip ES  →  http://localhost:${PROXY_PORT}  ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
}).catch(err => {
  console.error('[proxy] Error al calentar caché:', err.message);
  console.error('¿Está Paperclip corriendo en el puerto ' + PAPERCLIP_PORT + '?');
  process.exit(1);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
