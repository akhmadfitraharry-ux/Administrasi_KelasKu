// Cloudflare Pages Function: POST /api/generate
// Memakai Workers AI (binding bernama "AI") untuk menyusun RPP format Pembelajaran Mendalam (DPL).
import { gate, askAI, CORS_HEADERS } from './ai.js';

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

const ALL_DPL = [
  'DPL 1: Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa',
  'DPL 2: Kewargaan',
  'DPL 3: Penalaran Kritis',
  'DPL 4: Kreativitas',
  'DPL 5: Kolaborasi',
  'DPL 6: Kemandirian',
  'DPL 7: Kesehatan',
  'DPL 8: Komunikasi',
].join('; ');

export async function onRequestPost({ request, env }) {
  try {
    const ctx = await gate(request, env);

    const b = await request.json();
    const clean = (s, n = 400) => String(s ?? '').slice(0, n);
    if (!b.mapel || !b.topik) return json({ ok: false, error: 'mapel dan topik wajib diisi' }, 400);

    const manual = (Array.isArray(b.dpl) ? b.dpl : [])
      .slice(0, 8)
      .map((x) => `DPL ${Number(x.n) || ''}: ${clean(x.nama, 90)}`)
      .join('; ');

    const dplInstr = b.dplAuto
      ? `Pilih sendiri 3 sampai 4 Dimensi Profil Lulusan yang PALING sesuai dengan mata pelajaran, topik, dan kegiatan dari daftar ini: ${ALL_DPL}. Tuliskan nomor pilihanmu pada kunci "dpl" (array angka, mis. [1,3,5,8]) dan pakai hanya DPL itu sebagai penanda pada langkah kegiatan.`
      : `Dimensi Profil Lulusan terpilih oleh guru: ${manual || '-'}. Pakai hanya DPL itu sebagai penanda.`;

    const sumberTeks = clean(b.sumber_teks, 7000);

    const system =
      'Kamu adalah pakar perencanaan pembelajaran sekolah dasar di Indonesia (Kurikulum Merdeka, Pembelajaran Mendalam). ' +
      'Tulis dalam Bahasa Indonesia yang jelas, konkret, dan praktis untuk guru kelas SD. ' +
      'Balas HANYA dengan satu objek JSON valid tanpa teks lain dan tanpa markdown.';

    const user = `Susun RPP (Perencanaan Pembelajaran Mendalam) untuk:
- Sekolah: ${clean(b.sekolah, 100) || '-'}
- Mata pelajaran: ${clean(b.mapel, 80)}
- Kelas: ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}), Semester ${clean(b.semester, 2)}
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran dari guru: ${clean(b.tp, 600) || '(belum ada, buatkan satu tujuan terukur dengan ketepatan minimal 80 persen)'}
- Alokasi waktu: ${clean(b.alokasi, 80)}
- Buku/sumber: ${clean(b.sumber, 200) || '(tidak disebutkan; jangan mengarang nomor halaman)'}
- Catatan kondisi kelas: ${clean(b.catatan, 500) || '-'}
${sumberTeks ? `\nSUMBER MATERI (hasil baca buku/berkas guru). Jadikan ini acuan utama isi materi, contoh, dan istilah; jangan menambah fakta yang bertentangan:\n"""\n${sumberTeks}\n"""\n` : ''}
${dplInstr}

Keluarkan JSON dengan kunci berikut (semua nilai string kecuali "dpl" dan "rubrik"; gunakan \\n untuk baris baru dan penomoran "1.", "2.", ...):
"dpl", "peserta" (karakteristik peserta didik), "materi", "cp" (capaian pembelajaran), "lintas" (lintas disiplin ilmu), "tp" (tujuan pembelajaran),
"praktik" (praktik pedagogis), "kemitraan", "lingkungan", "digital",
"awal" (kegiatan awal), "memahami", "mengaplikasi", "merefleksi" (tiga tahap kegiatan inti), "penutup",
"as_awal", "as_proses", "as_akhir" (asesmen awal, proses, akhir),
"rubrik_judul", "rubrik_tujuan", dan "rubrik" berupa array 3 objek dengan kunci "indikator","baru_memulai","berkembang","cakap","mahir".
Aturan: setiap langkah kegiatan diakhiri penanda DPL yang sesuai, mis. "(DPL 3)". Langkah kegiatan harus aktif, berpusat pada peserta didik, sesuai usia SD, dan tidak memerlukan proyektor kecuali disebut. Ringkas namun lengkap.`;

    const text = await askAI(env, ctx, system, user, 2800, 0.5);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ ok: false, error: 'Respons AI tidak berformat JSON' }, 502);

    let data;
    try {
      data = JSON.parse(m[0]);
    } catch {
      return json({ ok: false, error: 'JSON dari AI tidak valid, coba lagi' }, 502);
    }
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, (e && e.status) || 500);
  }
}
