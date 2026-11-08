// Bagian bersama untuk semua rute AI: pemeriksa akses, jalur Cloudflare Workers AI, dan jalur Gemini (kunci pribadi pengguna).
//
// Aturan akses:
//  - Pengguna yang mengirim kunci Gemini pribadi (header x-gemini-key) memakai kuota Google miliknya sendiri.
//  - Tanpa kunci Gemini, permintaan memakai Workers AI milik pemilik Worker. Bila rahasia ACCESS_SECRET diisi
//    di Cloudflare, jalur ini hanya terbuka bagi pemegang kode akses yang sah (header x-akses).
//  - Bila WAJIB_KODE = "1", kode akses diminta untuk SEMUA pengguna (termasuk yang memakai kunci Gemini sendiri).
export const CORS_HEADERS = 'content-type, x-gemini-key, x-akses, x-dev';

const enc = new TextEncoder();
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const fail = (status, msg) => Object.assign(new Error(msg), { status });

// Kode akses: KK-<NAMA>-<YYYYMMDD atau 0>-<10 huruf/angka tanda tangan>
// Tanda tangan = HMAC(rahasia, NAMA|TANGGAL|ID-PERANGKAT). ID perangkat kosong bila kode tidak dikunci ke perangkat tertentu.
export async function cekKode(env, kode, dev) {
  const p = String(kode || '').trim().toUpperCase().split('-');
  if (p.length !== 4 || p[0] !== 'KK' || !/^[A-Z0-9]{1,20}$/.test(p[1]) || !/^(0|\d{8})$/.test(p[2])) return 'Kode akses tidak valid';
  const d = String(dev || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const sama = (want) => {
    let diff = want.length ^ p[3].length;
    for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (p[3].charCodeAt(i) || 0);
    return !diff;
  };
  const sig = async (x) => (await hmacHex(env.ACCESS_SECRET, p[1] + '|' + p[2] + '|' + x)).slice(0, 10).toUpperCase();
  const okBebas = sama(await sig(''));
  const okPerangkat = d ? sama(await sig(d)) : false;
  if (!okBebas && !okPerangkat) return 'Kode akses tidak valid atau bukan untuk perangkat ini';
  if (p[2] !== '0' && p[2] < new Date().toISOString().slice(0, 10).replace(/-/g, '')) return 'Kode akses sudah kedaluwarsa';
  return '';
}

// Menentukan jalur yang dipakai. Melempar galat berstatus bila tidak boleh.
export async function gate(request, env) {
  const key = (request.headers.get('x-gemini-key') || '').trim();
  const kode = request.headers.get('x-akses') || '';
  const wajib = env.WAJIB_KODE === '1';
  if (env.ACCESS_SECRET && (wajib || !key)) {
    const why = await cekKode(env, kode, request.headers.get('x-dev'));
    if (why) throw fail(401, key || wajib ? why : why + '. Isi kode akses atau kunci Gemini pribadi di menu Pengaturan.');
  }
  if (key) return { mode: 'gemini', key };
  if (!env.AI) throw fail(500, 'Binding Workers AI (AI) belum dipasang.');
  return { mode: 'cf' };
}

const pickText = (out) => {
  let t = '';
  if (typeof out === 'string') t = out;
  else if (out && typeof out.response === 'string') t = out.response;
  else if (out && out.choices && out.choices[0]) {
    const c = out.choices[0].message ? out.choices[0].message.content : out.choices[0].text;
    t = Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : String(c || '');
  }
  return t.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

// ---- Cloudflare Workers AI (model lama llama-3.1-8b sudah dihentikan; dicoba berurutan) ----
const CF_MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/zai-org/glm-4.7-flash', '@cf/moonshotai/kimi-k2.6'];
async function askCf(env, system, user, max, temperature) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let last = new Error('AI tidak menjawab');
  for (const model of CF_MODELS) {
    for (const extra of [{ chat_template_kwargs: { enable_thinking: false } }, {}]) {
      try {
        const out = await env.AI.run(model, { messages, max_completion_tokens: max * 2, temperature, ...extra });
        const t = pickText(out);
        if (t.includes('{')) return t;
        last = new Error('Respons AI kosong');
        break;
      } catch (e) {
        last = e;
      }
    }
  }
  throw last;
}

// ---- Gemini (kunci milik pengguna) ----
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
async function gemini(key, body) {
  let last = new Error('Gemini tidak menjawab');
  for (const model of GEMINI_MODELS) {
    for (const think of [true, false]) {
      const b = JSON.parse(JSON.stringify(body));
      if (think) b.generationConfig = { ...b.generationConfig, thinkingConfig: { thinkingBudget: 0 } };
      let res, j;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(b),
        });
        j = await res.json().catch(() => ({}));
      } catch (e) {
        last = new Error('Tidak dapat menghubungi Google: ' + String(e.message || e).slice(0, 60));
        break;
      }
      if (res.ok) {
        const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
        const t = parts.filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
        if (t) return t;
        last = new Error('Gemini mengembalikan jawaban kosong' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (diblokir)' : ''));
        break;
      }
      const msg = (j.error && j.error.message) || 'HTTP ' + res.status;
      if (res.status === 400 && /API key|API_KEY/i.test(msg)) throw fail(401, 'Kunci Gemini tidak valid. Periksa kembali kunci di Pengaturan.');
      if (res.status === 403) throw fail(401, 'Kunci Gemini ditolak Google (' + msg.slice(0, 80) + ')');
      last = fail(res.status === 429 ? 429 : 502, res.status === 429 ? 'Kuota gratis Gemini habis untuk sementara, coba lagi nanti.' : 'Gemini: ' + msg.slice(0, 120));
      if (res.status === 400 && think) continue; // model tak mendukung thinkingConfig -> ulangi tanpa itu
      break;
    }
  }
  throw last;
}

async function askGemini(key, system, user, max, temperature) {
  return gemini(key, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: max * 2, temperature, responseMimeType: 'application/json' },
  });
}

// Membaca teks dari gambar / PDF lewat Gemini.
export async function geminiLihat(key, mime, b64, prompt) {
  return gemini(key, {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }],
    generationConfig: { maxOutputTokens: 3000, temperature: 0.1 },
  });
}

export function askAI(env, ctx, system, user, max, temperature) {
  return ctx.mode === 'gemini' ? askGemini(ctx.key, system, user, max, temperature) : askCf(env, system, user, max, temperature);
}
