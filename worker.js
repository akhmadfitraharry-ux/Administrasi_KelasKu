// KelasKu — Cloudflare Worker (pintu masuk tunggal)
// Melayani aplikasi (index.html), berkas PWA, dan rute AI: /api/generate, /api/extract, /api/tugas.
import indexHtml from './index.html';
import * as generate from './generate.js';
import * as extract from './extract.js';
import * as tugas from './tugas.js';
import * as sync from './sync.js';

const FILES = {
  '/sw.js': ['application/javascript; charset=utf-8', "const CACHE = 'kelasku-v5';\nconst FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];\n\nself.addEventListener('install', (e) => {\n  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));\n});\n\nself.addEventListener('activate', (e) => {\n  e.waitUntil(\n    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())\n  );\n});\n\nself.addEventListener('fetch', (e) => {\n  const u = new URL(e.request.url);\n  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;\n  e.respondWith(\n    fetch(e.request)\n      .then((r) => {\n        const copy = r.clone();\n        caches.open(CACHE).then((c) => c.put(e.request, copy));\n        return r;\n      })\n      .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html')))\n  );\n});\n"],
  '/manifest.webmanifest': ['application/manifest+json; charset=utf-8', "{\n  \"name\": \"KelasKu — Administrasi Guru SD\",\n  \"short_name\": \"KelasKu\",\n  \"lang\": \"id\",\n  \"start_url\": \"./\",\n  \"display\": \"standalone\",\n  \"background_color\": \"#eceaff\",\n  \"theme_color\": \"#1b1446\",\n  \"icons\": [{ \"src\": \"icon.svg\", \"sizes\": \"any\", \"type\": \"image/svg+xml\", \"purpose\": \"any maskable\" }]\n}\n"],
  '/icon.svg': ['image/svg+xml; charset=utf-8', "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"a\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#2d1f78\"/><stop offset=\"1\" stop-color=\"#1b1446\"/></linearGradient><linearGradient id=\"b\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffd35a\"/><stop offset=\"1\" stop-color=\"#ff9d00\"/></linearGradient></defs><rect width=\"512\" height=\"512\" fill=\"url(#a)\"/><path d=\"M256 110l120 60v130l-120 60-120-60V170z\" fill=\"#00b8a0\"/><path d=\"M256 110l120 60-120 60-120-60z\" fill=\"#5eead4\"/><path d=\"M256 230l120-60v130l-120 60z\" fill=\"#008f7d\"/><text x=\"256\" y=\"395\" text-anchor=\"middle\" font-family=\"Arial\" font-weight=\"900\" font-size=\"90\" fill=\"url(#b)\">KK</text></svg>\n"],
};
const routes = { '/api/generate': generate, '/api/extract': extract, '/api/tugas': tugas, '/api/sync': sync };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const api = routes[path.replace(/\/+$/, '')];
    if (api) {
      if (request.method === 'OPTIONS') return api.onRequestOptions({ request, env });
      if (request.method === 'POST') return api.onRequestPost({ request, env });
      return new Response(JSON.stringify({ ok: false, error: 'Gunakan POST' }), {
        status: 405,
        headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
      });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const head = request.method === 'HEAD';
      if (path === '/' || path === '/index.html') {
        return new Response(head ? null : indexHtml, {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
        });
      }
      const f = FILES[path];
      if (f) return new Response(head ? null : f[1], { headers: { 'content-type': f[0], 'cache-control': 'no-cache' } });
    }
    return new Response('Tidak ditemukan', { status: 404 });
  },
};
