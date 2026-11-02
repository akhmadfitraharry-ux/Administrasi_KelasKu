// Cloudflare Pages Function: POST /api/extract
// Membaca teks dari foto halaman buku (model vision) serta PDF / Word (AI.toMarkdown).
// Body JSON: { name, type, data }  -> data = isi berkas dalam base64.
const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

const toBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const PROMPT =
  'Ini foto halaman buku pelajaran sekolah dasar. Transkripsikan teks penting yang terlihat (judul, isi, daftar, keterangan gambar) ' +
  'dalam Bahasa Indonesia apa adanya. Jika ada ilustrasi, jelaskan singkat. Jangan menambah informasi yang tidak ada di gambar.';

async function runVision(env, dataUrl, bytes) {
  const shapes = [
    // Bentuk resmi dari tutorial Cloudflare: messages teks + image berupa data URI base64.
    () => ({ messages: [{ role: 'user', content: PROMPT }], image: dataUrl, max_tokens: 1500 }),
    () => ({ messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 1500 }),
    () => ({ prompt: PROMPT, image: [...bytes], max_tokens: 1500 }),
  ];
  let lastErr;
  for (const make of shapes) {
    try {
      return await env.AI.run(VISION, make());
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/5016|agree/i.test(msg)) {
        // Model Meta meminta persetujuan lisensi sekali saja per akun.
        await env.AI.run(VISION, { prompt: 'agree' });
        return await env.AI.run(VISION, make());
      }
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) return json({ ok: false, error: 'Binding Workers AI (AI) belum dipasang.' }, 500);
    const { name = 'berkas', type = '', data } = await request.json();
    if (!data) return json({ ok: false, error: 'Berkas kosong' }, 400);
    if (data.length > 11_000_000) return json({ ok: false, error: 'Ukuran maksimal 8 MB' }, 413);
    const bytes = toBytes(data);

    let text = '';
    if (type.startsWith('image/')) {
      const r = await runVision(env, `data:${type};base64,${data}`, bytes);
      text = typeof r === 'string' ? r : r.response || '';
    } else if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
      text = new TextDecoder().decode(bytes);
    } else {
      const res = await env.AI.toMarkdown([{ name, blob: new Blob([bytes], { type: type || 'application/octet-stream' }) }]);
      const f = res && res[0];
      if (!f || f.format === 'error') return json({ ok: false, error: (f && f.error) || 'Format berkas belum didukung' }, 422);
      text = f.data || '';
    }
    text = String(text).trim().slice(0, 12000);
    if (!text) return json({ ok: false, error: 'Tidak ada teks yang terbaca' }, 422);
    return json({ ok: true, text });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, 500);
  }
}
