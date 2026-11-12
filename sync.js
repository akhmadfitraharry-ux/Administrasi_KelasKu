// Sinkron data pribadi pemilik antar perangkat: POST /api/sync
// Butuh: rahasia SYNC_KEY (Cloudflare → Variables and Secrets) dan KV namespace dengan binding bernama SYNC.
// Tanpa SYNC_KEY fitur ini mati, jadi aman bagi pengguna lain yang memakai Worker yang sama.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS } });
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

const MAX = 24 * 1024 * 1024; // batas nilai KV 25 MiB
function sama(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.SYNC_KEY) return json({ ok: false, error: 'Sinkron belum diaktifkan di server (rahasia SYNC_KEY belum diisi).' }, 403);
    if (!sama(request.headers.get('x-sync'), env.SYNC_KEY)) return json({ ok: false, error: 'Kunci sinkron salah.' }, 401);
    if (!env.SYNC || typeof env.SYNC.get !== 'function') return json({ ok: false, error: 'KV dengan binding SYNC belum terpasang di Worker.' }, 500);
    const b = await request.json();
    const meta = JSON.parse((await env.SYNC.get('meta')) || '{"rev":0,"t":"","size":0}');
    if (b.action === 'meta') return json({ ok: true, rev: meta.rev, t: meta.t, size: meta.size });
    if (b.action === 'pull') {
      if (!meta.rev) return json({ ok: false, error: 'Belum ada data di Cloud.' }, 404);
      const raw = await env.SYNC.get('db');
      return json({ ok: true, rev: meta.rev, t: meta.t, data: JSON.parse(raw) });
    }
    if (b.action === 'push') {
      if (!b.data || typeof b.data !== 'object' || !b.data.guru) return json({ ok: false, error: 'Data tidak valid.' }, 400);
      if (!b.force && Number(b.rev) !== meta.rev) {
        return json({ ok: false, conflict: true, rev: meta.rev, t: meta.t, error: 'Data di Cloud lebih baru dari yang Anda punya.' }, 409);
      }
      const raw = JSON.stringify(b.data);
      if (raw.length > MAX) return json({ ok: false, error: 'Data terlalu besar untuk disinkronkan (lebih dari 24 MB).' }, 413);
      const nm = { rev: meta.rev + 1, t: new Date().toISOString(), size: raw.length };
      await env.SYNC.put('db', raw);
      await env.SYNC.put('meta', JSON.stringify(nm));
      return json({ ok: true, rev: nm.rev, t: nm.t, size: nm.size });
    }
    return json({ ok: false, error: 'Aksi tidak dikenal' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
