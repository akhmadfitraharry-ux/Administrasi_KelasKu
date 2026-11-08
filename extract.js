// Cloudflare Pages Function: POST /api/extract
// Membaca teks dari foto halaman buku (model vision) serta PDF / Word (AI.toMarkdown).
// Body JSON: { name, type, data }  -> data = isi berkas dalam base64.
import { gate, geminiLihat, CORS_HEADERS } from './ai.js';
const VISION = '@cf/meta/llama-3.2-11b-vision-instruct';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': CORS_HEADERS,
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

const PROMPT_JAWABAN =
  'Ini foto lembar jawaban siswa sekolah dasar. Transkripsikan persis: baris pertama "Nama: <nama siswa>" bila ada, lalu tiap nomor beserta jawabannya dengan format "1. A", "2. B", dan seterusnya (untuk isian tulis jawabannya apa adanya). ' +
  'Jika suatu nomor kosong atau tidak terbaca, tulis nomornya dengan tanda "-". Jangan menebak dan jangan menambah isi.';

async function runVision(env, dataUrl, bytes, mode) {
  const PROMPT_USE = mode === 'jawaban' ? PROMPT_JAWABAN : PROMPT;
  const shapes = [
    // Bentuk resmi dari tutorial Cloudflare: messages teks + image berupa data URI base64.
    () => ({ messages: [{ role: 'user', content: PROMPT_USE }], image: dataUrl, max_tokens: 1500 }),
    () => ({ messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT_USE }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 1500 }),
    () => ({ prompt: PROMPT_USE, image: [...bytes], max_tokens: 1500 }),
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
    const ctx = await gate(request, env);
    const { name = 'berkas', type = '', data, mode = '' } = await request.json();
    if (!data) return json({ ok: false, error: 'Berkas kosong' }, 400);
    if (data.length > 11_000_000) return json({ ok: false, error: 'Ukuran maksimal 8 MB' }, 413);
    const bytes = toBytes(data);

    let text = '';
    const lihat = (mode2) => (mode2 === 'jawaban' ? PROMPT_JAWABAN : PROMPT);
    if (ctx.mode === 'gemini' && (type.startsWith('image/') || type === 'application/pdf')) {
      text = await geminiLihat(ctx.key, type, data, type === 'application/pdf' ? 'Salin seluruh teks dokumen PDF ini apa adanya dalam Bahasa Indonesia (tabel tulis baris per baris). Jangan menambah informasi.' : lihat(mode));
    } else if (type.startsWith('image/')) {
      if (!env.AI) throw Object.assign(new Error('Binding Workers AI (AI) belum dipasang.'), { status: 500 });
      const r = await runVision(env, `data:${type};base64,${data}`, bytes, mode);
      text = typeof r === 'string' ? r : r.response || '';
    } else if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
      text = new TextDecoder().decode(bytes);
    } else {
      if (!env.AI) return json({ ok: false, error: 'Format ini belum bisa dibaca di server ini. Gunakan foto atau PDF.' }, 422);
      const res = await env.AI.toMarkdown([{ name, blob: new Blob([bytes], { type: type || 'application/octet-stream' }) }]);
      const f = res && res[0];
      if (!f || f.format === 'error') return json({ ok: false, error: (f && f.error) || 'Format berkas belum didukung' }, 422);
      text = f.data || '';
    }
    text = String(text).trim().slice(0, 12000);
    if (!text) return json({ ok: false, error: 'Tidak ada teks yang terbaca' }, 422);
    return json({ ok: true, text });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, (e && e.status) || 500);
  }
}
