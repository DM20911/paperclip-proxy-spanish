/**
 * Traductor DOM síncrono para Paperclip UI.
 * Procesa mutaciones en el mismo ciclo que React, antes de que el browser pinte.
 * No modifica código, variables ni APIs — solo nodos de texto visibles.
 */
(function () {
  'use strict';

  const T = window.PAPERCLIP_TRANSLATIONS_ES || {};
  if (!Object.keys(T).length) return;

  // Índice: texto_en_minúsculas → traducción
  const INDEX = Object.fromEntries(
    Object.entries(T).map(([k, v]) => [k.toLowerCase(), v])
  );

  // Para traducción parcial: ordenado por longitud desc (frases antes que palabras)
  const SORTED = Object.entries(T).sort((a, b) => b[0].length - a[0].length);

  // ─── Qué ignorar ────────────────────────────────────────────────────────────

  const SKIP_TAGS = new Set([
    'SCRIPT','STYLE','CODE','PRE','TEXTAREA','INPUT','SELECT','KBD',
    'SAMP','VAR','NOSCRIPT','TEMPLATE','MATH',
  ]);

  // Atributos que indican que el elemento contiene código o IDs técnicos
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.tagName === 'SVG') return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ─── Traducir un nodo de texto ───────────────────────────────────────────────

  // Guard para evitar loop infinito cuando modificamos nodeValue
  let busy = false;

  function translateNode(node) {
    if (busy) return;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    if (shouldSkip(node)) return;

    const raw = node.nodeValue;
    if (!raw || !raw.trim()) return;

    const trimmed = raw.trim();
    if (UUID.test(trimmed)) return;

    const key = trimmed.toLowerCase();

    // Coincidencia exacta (más común en labels y botones)
    if (INDEX[key]) {
      const lead  = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      const translated = lead + INDEX[key] + trail;
      if (translated !== raw) {
        busy = true;
        node.nodeValue = translated;
        busy = false;
      }
      return;
    }

    // Coincidencia parcial (texto con frases mezcladas)
    if (trimmed.length > 500) return; // saltar párrafos largos
    let result = raw;
    for (const [en, es] of SORTED) {
      if (!result.toLowerCase().includes(en.toLowerCase())) continue;
      result = result.replace(
        new RegExp(`(?<![\\w\\u00C0-\\u024F])${escRe(en)}(?![\\w\\u00C0-\\u024F])`, 'gi'),
        es
      );
    }
    if (result !== raw) {
      busy = true;
      node.nodeValue = result;
      busy = false;
    }
  }

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Recorrer un subárbol ────────────────────────────────────────────────────

  function translateTree(root) {
    if (!root) return;
    // Si es nodo de texto directo
    if (root.nodeType === Node.TEXT_NODE) { translateNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (shouldSkip(n)) return NodeFilter.FILTER_REJECT;
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(translateNode);
  }

  // ─── MutationObserver síncrono ────────────────────────────────────────────────

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => translateTree(n));
      } else if (m.type === 'characterData') {
        translateNode(m.target);
      }
    }
  });

  // ─── Arrancar ─────────────────────────────────────────────────────────────────

  function init() {
    translateTree(document.body);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Repasar tras la carga completa (lazy components, data fetches)
    window.addEventListener('load', () => translateTree(document.body));

    // Repasar en cada cambio de ruta SPA
    let lastHref = location.href;
    new MutationObserver(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        setTimeout(() => translateTree(document.body), 100);
        setTimeout(() => translateTree(document.body), 500);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
