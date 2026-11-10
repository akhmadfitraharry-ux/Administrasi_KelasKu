// Cloudflare Pages Function: POST /api/tugas
// Satu pintu untuk sembilan tugas AI: rapor | perangkat | soal | lkpd | karakter | kalender | tindaklanjut | surat | impor  (body: { task, ... })
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

const clean = (s, n = 400) => String(s ?? '').slice(0, n);
const num = (v, d, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || d));
const SYS =
  'Kamu adalah pakar administrasi dan asesmen sekolah dasar di Indonesia (Kurikulum Merdeka). ' +
  'Tulis dalam Bahasa Indonesia yang jelas, sopan, dan sesuai usia peserta didik SD. ' +
  'Balas HANYA dengan satu objek JSON valid tanpa teks lain dan tanpa markdown.';

const tasks = {
  // ---- deskripsi capaian rapor ----
  rapor(b) {
    const list = (Array.isArray(b.mapel) ? b.mapel : []).slice(0, 14);
    if (!list.length) throw new Error('Data nilai kosong');
    const rows = list
      .map((m) => {
        const t = m.tertinggi ? `TP/materi terkuat: "${clean(m.tertinggi.tp, 120)}"` : 'TP/materi terkuat: (tidak dicatat)';
        const r = m.terendah ? `TP/materi perlu bimbingan: "${clean(m.terendah.tp, 120)}"` : 'TP/materi perlu bimbingan: (tidak dicatat)';
        return `- ${clean(m.nama, 60)} | rata-rata ${Number(m.rata) || 0} | ${t} | ${r}`;
      })
      .join('\n');
    return {
      max: 1800,
      user: `Susun deskripsi capaian kompetensi untuk rapor.
Peserta didik: ${clean(b.nama, 60)} (${b.jk === 'P' ? 'perempuan' : 'laki-laki'}), kelas ${clean(b.kelas, 3) || '-'}.
Batas ketuntasan: ${num(b.kktp, 70, 0, 100)}.
Data per mata pelajaran:
${rows}
Catatan guru tentang siswa: ${clean(b.catatan, 400) || '-'}

Keluarkan JSON: {"deskripsi":{"<nama mata pelajaran persis seperti di data>":"2 sampai 3 kalimat"},"catatan_wali":"2 sampai 3 kalimat"}.
Aturan: sebut siswa dengan "Ananda ${clean(b.nama, 60).split(' ')[0]}"; kalimat positif dan membangun; sebut materi terkuat sebagai yang sudah dikuasai; sebut materi perlu bimbingan hanya jika nilainya di bawah batas ketuntasan atau memang tercatat; JANGAN menulis angka nilai; JANGAN mengarang materi di luar data; jika materi tidak dicatat, tulis capaian umum sesuai rata-rata.`,
    };
  },

  // ---- perangkat ajar: ATP, KKTP, Prota, Promes ----
  perangkat(b) {
    const topik = (Array.isArray(b.topik) ? b.topik : []).map((x) => clean(x, 120)).filter(Boolean).slice(0, 14);
    const total = num(b.totalJp, 64, 4, 400);
    return {
      max: 3200,
      user: `Susun perangkat ajar semester untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}
- Kelas: ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}), Semester ${clean(b.semester, 2)}
- Total alokasi semester: ${total} JP (${num(b.jpMinggu, 4, 1, 40)} JP per minggu x ${num(b.minggu, 16, 4, 30)} minggu efektif)
- Capaian Pembelajaran / catatan guru: ${clean(b.cp, 1500) || '(tidak diberikan, gunakan CP umum mata pelajaran ini pada fase tersebut)'}
${topik.length ? `- Topik dari guru, pertahankan urutannya (satu item per topik):\n${topik.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}` : '- Topik: usulkan 6 sampai 8 topik/bab yang lazim untuk semester dan kelas ini.'}

Keluarkan JSON: {"items":[{"judul":"","materi":"materi pokok","tp":"tujuan pembelajaran satu kalimat diawali 'Peserta didik mampu'","jp":0,"kktp":{"perlu":"kriteria perlu bimbingan","cukup":"kriteria cukup","baik":"kriteria baik","sangat":"kriteria sangat baik"},"asesmen":"bentuk asesmen singkat"}]}.
Aturan: jumlah "jp" semua item harus sama dengan ${total}; tujuan pembelajaran terukur; kriteria KKTP berbentuk deskripsi capaian, bukan angka; jangan menambah kunci lain.`,
    };
  },

  // ---- soal + kunci ----
  soal(b) {
    const pg = num(b.pg, 10, 0, 20), isi = num(b.isian, 5, 0, 10), ur = num(b.uraian, 2, 0, 5);
    if (!clean(b.topik, 150)) throw new Error('Topik wajib diisi');
    const sumber = clean(b.sumber_teks, 5000);
    return {
      max: 3500,
      user: `Buat soal evaluasi untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran: ${clean(b.tp, 600) || '(sesuaikan dengan topik)'}
- Sebaran tingkat berpikir: ${clean(b.level, 40) || 'Campuran C1-C4'}
${sumber ? `- SUMBER MATERI (soal harus bersumber dari sini, jangan menambah fakta di luar sumber):\n"""\n${sumber}\n"""` : ''}

Jumlah: ${pg} pilihan ganda, ${isi} isian singkat, ${ur} uraian.
Keluarkan JSON: {"pg":[{"q":"","a":"","b":"","c":"","d":"","kunci":"A/B/C/D","tp":"","level":"C1"}],"isian":[{"q":"","kunci":"","tp":"","level":"C1"}],"uraian":[{"q":"","kunci":"jawaban dan pedoman skor","tp":"","level":"C3"}]}.
Aturan: bahasa sederhana sesuai usia SD; pilihan ganda hanya satu jawaban benar, pengecoh masuk akal, kunci tersebar merata; jangan memakai gambar atau tabel; jangan menulis huruf A/B/C/D di dalam teks pilihan; kolom "tp" berisi tujuan pembelajaran yang diuji secara singkat.`,
    };
  },

  // ---- LKPD ----
  lkpd(b) {
    const sumber = clean(b.sumber_teks, 4000);
    return {
      max: 1800,
      user: `Buat Lembar Kerja Peserta Didik (LKPD) untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran: ${clean(b.tp, 600) || '(sesuaikan dengan topik)'}
${sumber ? `- SUMBER MATERI:\n"""\n${sumber}\n"""` : ''}

Keluarkan JSON: {"judul":"","tujuan":"","petunjuk":"","alat_bahan":"","kegiatan":["langkah 1","langkah 2"],"pertanyaan":["pertanyaan 1","pertanyaan 2"],"refleksi":""}.
Aturan: kegiatan berupa 3 sampai 5 langkah praktis berkelompok yang bisa dikerjakan tanpa proyektor; 4 sampai 6 pertanyaan bertingkat dari mudah ke sulit; bahasa ramah anak.`,
    };
  },
  // ---- ringkasan karakter siswa ----
  karakter(b) {
    const dim = (Array.isArray(b.dimensi) ? b.dimensi : []).slice(0, 8).map((d) => `- ${clean(d.nama, 80)}: ${clean(d.level, 20)}`).join('\n');
    const pro = (Array.isArray(b.proyek) ? b.proyek : []).slice(0, 8).map((d) => `- ${clean(d.judul, 80)}: ${clean(d.level, 20)}`).join('\n');
    const cat = (Array.isArray(b.catatan) ? b.catatan : []).slice(0, 8).map((c) => `- ${clean(c, 200)}`).join('\n');
    if (!dim && !cat) throw new Error('Data karakter kosong');
    return {
      max: 700,
      user: `Susun ringkasan perkembangan karakter peserta didik untuk rapor.
Peserta didik: ${clean(b.nama, 60)} (${b.jk === 'P' ? 'perempuan' : 'laki-laki'}), kelas ${clean(b.kelas, 3) || '-'}.
Capaian dimensi profil lulusan (Baru Memulai < Berkembang < Cakap < Mahir):
${dim || '-'}
Capaian projek:
${pro || '-'}
Catatan pengamatan guru:
${cat || '-'}

Keluarkan JSON: {"ringkasan":"3 sampai 4 kalimat"}.
Aturan: sebut siswa dengan "Ananda ${clean(b.nama, 60).split(' ')[0]}"; kalimat positif dan membangun; sebut dimensi yang menonjol (Cakap/Mahir) dan dimensi yang masih perlu bimbingan (Baru Memulai/Berkembang) dengan halus; JANGAN mengarang kejadian di luar data; JANGAN menulis huruf B/K/C/M.`,
    };
  },

  // ---- kalender pendidikan -> daftar kegiatan ----
  kalender(b) {
    const teks = clean(b.teks, 7000);
    if (teks.trim().length < 10) throw new Error('Teks kalender kosong');
    return {
      max: 3000,
      user: `Ubah teks kalender pendidikan berikut menjadi daftar kegiatan. Tahun ajaran: ${clean(b.tahunAjaran, 12) || '-'}.
"""
${teks}
"""

Keluarkan JSON: {"events":[{"tanggal":"YYYY-MM-DD","selesai":"YYYY-MM-DD atau string kosong","judul":"","jenis":""}]}.
Aturan: "jenis" harus salah satu dari: Libur, Asesmen/Ujian, Pembagian Rapor, Rapat/Pertemuan, Administrasi/Tenggat, Kegiatan Sekolah, Lainnya. Tahun penuh 4 digit (Juli sampai Desember memakai tahun pertama tahun ajaran, Januari sampai Juni tahun kedua). Rentang tanggal -> isi "tanggal" (awal) dan "selesai" (akhir); satu hari -> "selesai" kosong. Hanya kegiatan yang tertulis di teks; jangan mengarang tanggal.`,
    };
  },
  // ---- kegiatan remedial & pengayaan ----
  tindaklanjut(b) {
    return {
      max: 1800,
      user: `Susun rencana tindak lanjut hasil belajar untuk:
- Mata pelajaran: ${clean(b.mapel, 80)}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Materi / tujuan pembelajaran: ${clean(b.tp, 300)}
- Jumlah siswa remedial (di bawah ${num(b.kktp, 70, 0, 100)}): ${num(b.jmlRemedial, 0, 0, 60)}
- Jumlah siswa pengayaan (nilai 90 ke atas): ${num(b.jmlPengayaan, 0, 0, 60)}

Keluarkan JSON: {"remedial":{"kegiatan":["3 sampai 4 langkah kegiatan"],"soal":["4 sampai 5 soal latihan sederhana, tulis kunci jawaban dalam tanda kurung di akhir"]},"pengayaan":{"kegiatan":["2 sampai 3 kegiatan tantangan"],"soal":["3 soal tantangan yang menuntut penalaran, tulis kunci dalam tanda kurung"]}}.
Aturan: sesuai usia SD; kegiatan praktis tanpa proyektor; soal remedial berjenjang dari mudah; soal harus benar-benar berkaitan dengan materi tersebut; jika materi umum, buat soal umum yang sesuai mata pelajaran dan kelas.`,
    };
  },

  // ---- merapikan surat untuk orang tua ----
  surat(b) {
    const draf = clean(b.draf, 2500);
    if (draf.trim().length < 20) throw new Error('Draf surat kosong');
    return {
      max: 1200,
      user: `Rapikan isi surat sekolah berikut agar bahasanya santun, jelas, dan hangat untuk orang tua siswa SD.
Jenis surat: ${clean(b.jenis, 80)}. Sekolah: ${clean(b.sekolah, 80) || '-'}. Kelas ${clean(b.kelas, 3) || '-'}.
Draf:
"""
${draf}
"""

Keluarkan JSON: {"isi":"isi surat yang sudah dirapikan"}.
Aturan: pertahankan SEMUA fakta (tanggal, waktu, tempat, angka, nama mata pelajaran) dan token {nama} apa adanya; jangan menambah fakta baru; mulai dengan "Dengan hormat,"; 2 sampai 4 paragraf; jangan menulis salam pembuka alamat, tanda tangan, atau nama pengirim; tanpa markdown.`,
    };
  },
  // ---- impor data dari foto / PDF / Word / teks bebas ----
  impor(b) {
    const teks = clean(b.teks, 7000);
    if (teks.trim().length < 3) throw new Error('Teks kosong');
    const schema = {
      siswa: '{"rows":[{"nama":"","nis":"","jk":"L atau P","ortu":"","hp":""}]}',
      mapel: '{"rows":[{"nama":"","kelas":"angka 1-6","jp":0}]}',
      jadwal: '{"rows":[{"hari":"Senin..Sabtu","mulai":"HH:MM","selesai":"HH:MM","mapel":""}]}',
      nilai: '{"rows":[{"nama":"nama siswa","mapel":"","nilai":0,"jenis":"Harian/Tugas/Proyek/UTS/UAS atau kosong","tp":"","tanggal":"YYYY-MM-DD atau kosong"}]}',
      absensi: '{"rows":[{"nama":"nama siswa","tanggal":"YYYY-MM-DD","status":"H/S/I/A"}]}',
      asesmen: '{"rows":[{"judul":"","mapel":"","jenis":"Diagnostik/Formatif/Sumatif atau kosong","tanggal":"YYYY-MM-DD atau kosong","teknik":""}]}',
    };
    const tipe = clean(b.tipe, 12);
    if (!schema[tipe]) throw new Error('Jenis data tidak dikenal');
    const mp = (Array.isArray(b.mapel) ? b.mapel : []).slice(0, 30).map((x) => clean(x, 60)).join(', ');
    const extra = {
      siswa: 'Satu baris per siswa; "jk" hanya L atau P; kosongkan yang tidak ada.',
      mapel: 'Satu baris per mata pelajaran.',
      jadwal: 'Jika jadwal berbentuk tabel hari x jam, uraikan menjadi satu baris per pelajaran. Jam dengan format 24 jam HH:MM. Abaikan istirahat/upacara.',
      nilai: 'Satu baris per siswa per mata pelajaran; nilai angka 0 sampai 100; salin nama persis seperti tertulis.' + (mp ? ' Mata pelajaran yang sudah ada: ' + mp + '.' : ''),
      absensi: 'Satu baris per siswa per tanggal yang ada isinya; status hanya H, S, I, atau A. Jika hanya nomor hari tersedia, pakai bulan ' + clean(b.bulan, 7) + '.',
      asesmen: 'Satu baris per asesmen.',
    }[tipe];
    return {
      max: 3800,
      user: `Ekstrak data ${tipe} dari teks hasil pembacaan berkas guru berikut.
"""
${teks}
"""

Keluarkan JSON dengan bentuk: ${schema[tipe]}
Aturan: ${extra} Salin apa adanya; JANGAN mengarang data yang tidak ada di teks; abaikan judul, nomor urut, dan baris jumlah/rata-rata; tanggal dalam format YYYY-MM-DD.`,
    };
  },
  // ---- asisten tanya jawab data kelas ----
  tanya(b) {
    const q = clean(b.pertanyaan, 500);
    if (q.trim().length < 3) throw new Error('Pertanyaan kosong');
    const hist = (Array.isArray(b.riwayat) ? b.riwayat : []).slice(-6).map((m) => `${m && m.r === 'u' ? 'Guru' : 'Asisten'}: ${clean(m && m.t, 300)}`).join('\n');
    return {
      max: 900,
      user: `Kamu asisten administrasi guru kelas SD. Berikut rekap data kelas guru:
"""
${clean(b.konteks, 7000)}
"""
${hist ? `Percakapan sebelumnya:\n${hist}\n` : ''}Pertanyaan guru: ${q}

Keluarkan JSON: {"jawaban":"jawaban singkat dan jelas"}.
Aturan: jawab HANYA dari data di atas; jika informasinya tidak ada di data, katakan datanya belum tersedia; jangan mengarang nama atau angka; sebut nama dan angka persis seperti di data; bahasa Indonesia santun; teks biasa tanpa markdown (boleh daftar bernomor); beri saran tindak lanjut singkat hanya jika diminta atau jelas membantu.`,
    };
  },

  // ---- catatan cepat: pisahkan pengamatan per siswa ----
  catatan(b) {
    const teks = clean(b.teks, 5000);
    if (teks.trim().length < 6) throw new Error('Catatan kosong');
    const names = (Array.isArray(b.siswa) ? b.siswa : []).slice(0, 60).map((x) => clean(x, 60)).join('; ');
    return {
      max: 1800,
      user: `Pisahkan catatan pengamatan guru berikut menjadi catatan perkembangan karakter per peserta didik kelas ${clean(b.kelas, 3) || '-'} SD.
Daftar siswa kelas (gunakan nama PERSIS dari daftar ini): ${names || '-'}
Catatan guru:
"""
${teks}
"""

Keluarkan JSON: {"catatan":[{"nama":"nama persis dari daftar","teks":"1 sampai 2 kalimat objektif dan membangun, diawali 'Ananda <nama panggilan>'","dpl":[nomor dimensi]}]}.
Dimensi: 1 Keimanan dan ketakwaan, 2 Kewargaan, 3 Penalaran Kritis, 4 Kreativitas, 5 Kolaborasi, 6 Kemandirian, 7 Kesehatan, 8 Komunikasi.
Aturan: hanya siswa yang disebut di catatan dan ada di daftar; gabungkan pengamatan siswa yang sama; jangan mengarang kejadian; "dpl" berisi 1 sampai 2 nomor yang paling sesuai.`,
    };
  },

  // ---- rubrik & instrumen asesmen ----
  instrumen(b) {
    const jenis = clean(b.jenis, 12);
    const schema = {
      rubrik: '{"judul":"","tujuan":"","kriteria":[{"kriteria":"","baru":"","berkembang":"","cakap":"","mahir":""}]}',
      observasi: '{"judul":"","petunjuk":"","aspek":[{"aspek":"","indikator":""}]}',
      angket: '{"judul":"","petunjuk":"","pernyataan":["pernyataan 1"]}',
      checklist: '{"judul":"","tahap":[{"tahap":"","kegiatan":["kegiatan 1"]}]}',
    }[jenis];
    if (!schema) throw new Error('Jenis instrumen tidak dikenal');
    const aturan = {
      rubrik: '4 sampai 5 kriteria yang terukur; tiap level (Baru Memulai, Berkembang, Cakap, Mahir) berupa deskripsi perilaku nyata yang bisa diamati, bukan angka.',
      observasi: '4 sampai 6 aspek yang bisa diamati selama kegiatan; indikator berupa perilaku konkret; petunjuk menyebut skala skor 1 sampai 4 (Baru Memulai, Berkembang, Cakap, Mahir).',
      angket: '8 sampai 12 pernyataan sederhana dari sudut pandang anak ("Aku ..."), mengungkap pengetahuan awal, minat, dan gaya belajar terkait topik; petunjuk menjelaskan pilihan Sudah, Mulai, Belum.',
      checklist: '4 sampai 5 tahap projek (mis. persiapan, pelaksanaan, penyajian, refleksi), tiap tahap 2 sampai 4 kegiatan konkret yang bisa dicentang.',
    }[jenis];
    return {
      max: 2200,
      user: `Buat instrumen asesmen (${jenis}) untuk:
- Mata pelajaran: ${clean(b.mapel, 80) || '-'}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150) || '-'}
- Tujuan pembelajaran: ${clean(b.tp, 600) || '(sesuaikan dengan topik)'}
- Yang dinilai / catatan guru: ${clean(b.catatan, 200) || '-'}

Keluarkan JSON: ${schema}.
Aturan: ${aturan} Bahasa Indonesia sesuai usia SD, praktis tanpa proyektor, jangan menambah kunci lain.`,
    };
  },
  // ---- saran tindak lanjut siswa perlu perhatian ----
  dini(b) {
    const al = (Array.isArray(b.alasan) ? b.alasan : []).slice(0, 8).map((x) => `- ${clean(x, 120)}`).join('\n');
    const nl = (Array.isArray(b.nilai) ? b.nilai : []).slice(0, 12).map((x) => `${clean(x && x.mapel, 40)} ${Number(x && x.rata) || 0}`).join('; ');
    if (!al) throw new Error('Data kosong');
    return {
      max: 900,
      user: `Guru kelas ${clean(b.kelas, 3) || '-'} SD membutuhkan saran tindak lanjut untuk peserta didik ${clean(b.nama, 60)} (${b.jk === 'P' ? 'perempuan' : 'laki-laki'}).
Hal yang tercatat:
${al}
Nilai rata-rata: ${nl || '-'}

Keluarkan JSON: {"saran":["3 sampai 5 langkah konkret"]}.
Aturan: langkah praktis, hangat, dan bisa dilakukan guru kelas SD dalam 1-2 minggu; urutkan dari yang paling mendesak; jangan mendiagnosis kondisi medis atau psikologis; jangan menyalahkan anak atau orang tua; bila ada masalah kehadiran, sertakan komunikasi dengan orang tua; jangan mengarang fakta di luar data.`,
    };
  },

  // ---- RPP diferensiasi ----
  diferensiasi(b) {
    const V = { pendampingan: 'peserta didik yang perlu pendampingan', pengayaan: 'peserta didik yang cepat paham (pengayaan)', visual: 'gaya belajar visual', auditori: 'gaya belajar auditori', kinestetik: 'gaya belajar kinestetik' };
    const pilih = (Array.isArray(b.pilih) ? b.pilih : []).filter((k) => V[k]).slice(0, 5);
    if (!pilih.length) throw new Error('Pilih minimal satu jenis');
    return {
      max: 2600,
      user: `Susun diferensiasi pembelajaran untuk:
- Mata pelajaran: ${clean(b.mapel, 80) || '-'}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Tujuan pembelajaran: ${clean(b.tp, 500) || '(sesuaikan dengan topik)'}
- Alur RPP guru: awal: ${clean(b.awal, 400) || '-'} | inti: ${clean(b.inti, 900) || '-'}
- Kondisi kelas: ${clean(b.catatan, 200) || '-'}

Buat satu varian untuk setiap kelompok berikut (kode: arti): ${pilih.map((k) => `${k}: ${V[k]}`).join('; ')}.
Keluarkan JSON: {"varian":[{"kode":"salah satu kode di atas","judul":"","profil":"1 kalimat ciri kelompok ini","kegiatan":["3 sampai 5 kegiatan konkret pada topik ini"],"asesmen":"cara menilai singkat"}]}.
Aturan: tujuan pembelajaran tetap sama untuk semua kelompok, hanya cara/dukungan/tantangan yang berbeda; kegiatan praktis tanpa proyektor; bahasa Indonesia sesuai guru SD.`,
    };
  },

  // ---- bahan ajar & ice breaker ----
  bahan(b) {
    const jenis = clean(b.jenis, 60);
    if (!clean(b.topik, 150)) throw new Error('Topik wajib diisi');
    const sumber = clean(b.sumber_teks, 4000);
    return {
      max: 1800,
      user: `Buat "${jenis}" untuk:
- Mata pelajaran: ${clean(b.mapel, 80) || '-'}, kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)})
- Topik: ${clean(b.topik, 150)}
- Permintaan khusus guru: ${clean(b.catatan, 200) || '-'}
${sumber ? `- SUMBER MATERI (jadikan acuan, jangan menambah fakta di luar sumber):\n"""\n${sumber}\n"""` : ''}

Keluarkan JSON: {"judul":"","isi":"isi lengkap sebagai teks biasa, gunakan \\n untuk baris baru"}.
Aturan: bahasa ramah anak SD; ringkasan materi singkat (maksimal 10 kalimat pendek) dengan contoh dekat kehidupan anak; cerita 150-250 kata dengan pesan jelas; ice breaker/permainan sertakan alat (jika ada), langkah bernomor, dan durasi; pantun/lagu singkat mudah dihafal; tanpa markdown; jangan mengarang fakta ilmiah.`,
    };
  },

  // ---- dokumen kinerja guru ----
  kinerja(b) {
    const f = b.fakta && typeof b.fakta === 'object' ? b.fakta : {};
    const g = b.guru && typeof b.guru === 'object' ? b.guru : {};
    return {
      max: 2400,
      user: `Susun "${clean(b.jenis, 80)}" untuk guru kelas SD.
Guru: ${clean(g.nama, 60) || '-'}; sekolah ${clean(g.sekolah, 80) || '-'}; kelas ${clean(g.kelas, 3) || '-'}; TA ${clean(g.tahun, 12)} semester ${clean(g.semester, 8)}.
FAKTA dari catatan guru (satu-satunya sumber angka):
${clean(JSON.stringify(f), 3500)}

Keluarkan JSON: {"judul":"","isi":"dokumen lengkap sebagai teks biasa dengan bagian A, B, C dst, gunakan \\n untuk baris baru"}.
Aturan: gunakan HANYA fakta di atas; angka disalin persis; bila suatu data kosong/null tulis "belum tercatat"; JANGAN mengarang kegiatan, angka, atau prestasi; untuk bagian kendala dan tindak lanjut tulis usulan umum dan beri tanda "(usulan, mohon disesuaikan)"; bahasa Indonesia baku, formal, ringkas; tanpa markdown.`,
    };
  },

  // ---- membaca lembar jawaban siswa ----
  jawaban(b) {
    const teks = clean(b.teks, 3000);
    if (teks.trim().length < 3) throw new Error('Teks kosong');
    const nPg = num(b.nPg, 0, 0, 60), nIs = num(b.nIsian, 0, 0, 30);
    return {
      max: 900,
      user: `Berikut hasil pembacaan foto lembar jawaban seorang siswa SD:
"""
${teks}
"""
Jumlah pilihan ganda: ${nPg}; jumlah isian singkat: ${nIs}.

Keluarkan JSON: {"nama":"nama siswa atau string kosong","pg":["tepat ${nPg} huruf A/B/C/D, string kosong bila kosong atau tidak terbaca"],"isian":["tepat ${nIs} jawaban, string kosong bila kosong"]}.
Aturan: urutkan menurut nomor soal; JANGAN menebak jawaban yang tidak terbaca; salin jawaban isian apa adanya.`,
    };
  },
  // ---- perangkat STEM: bagian 1 (rancangan) ----
  stem(b) {
    const topik = clean(b.topik, 160) || clean(b.tema, 120);
    if (!topik) throw new Error('Topik kosong');
    const n = num(b.pertemuan, 4, 1, 6);
    const src = clean(b.sumber_teks, 3500);
    return {
      max: 2600,
      user: `Susun rancangan pembelajaran terintegrasi STEM (Sains, Teknologi, Teknik/Rekayasa, Matematika) untuk SD, Kurikulum Merdeka.
Jenis: ${clean(b.mode, 60)}; tema: ${clean(b.tema, 80) || '-'}; mapel: ${clean(b.mapel, 60) || '-'}; kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}); topik/masalah: ${topik}; ${n} pertemuan x ${clean(b.jp, 3)} JP.
Kondisi/bahan tersedia: ${clean(b.catatan, 200) || 'bahan sederhana'}.
${src ? 'Materi acuan dari buku:\n"""\n' + src + '\n"""\n' : ''}Dimensi Profil Lulusan (nomor 1-8): ${Array.isArray(b.dplNama) ? b.dplNama.slice(0, 8).map((x, i) => (i + 1) + '=' + clean(x, 60)).join('; ') : ''}.

Keluarkan JSON: {"judul":"","deskripsi":"2 kalimat","pertanyaan_pemandu":"Bagaimana kita dapat ...?","mapel_terkait":[""],"dpl":[3,4,5],"tujuan":["3 sampai 4 tujuan pembelajaran"],"integrasi":{"s":{"tp":"","kegiatan":""},"t":{"tp":"","kegiatan":""},"e":{"tp":"","kegiatan":""},"m":{"tp":"","kegiatan":""}},"alur":[{"pertemuan":"Pertemuan 1","tahap":"Tanya","kegiatan":"","fokus":"S, M"}],"alat_bahan":[""],"produk":"","keselamatan":[""]}.
Aturan: alur tepat ${n} baris mengikuti proses desain rekayasa (Tanya, Imajinasi dan Rencana, Buat, Uji dan Perbaiki, Bagikan dan Refleksi); bahan murah dan mudah didapat; kegiatan sesuai usia dan aman; matematika harus berupa pengukuran/pengolahan data nyata; teknologi boleh sederhana (tanpa listrik bila perlu); jangan mengarang fakta ilmiah.`,
    };
  },

  // ---- perangkat STEM: bagian 2 (LKPD, rubrik, asesmen) ----
  stem2(b) {
    const tujuan = Array.isArray(b.tujuan) ? b.tujuan.slice(0, 6).map((x) => clean(x, 200)).join('; ') : '';
    return {
      max: 2600,
      user: `Untuk projek STEM SD berikut, buat LKPD, rubrik, asesmen, dan refleksi.
Judul: ${clean(b.judul, 160)}; kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}); topik: ${clean(b.topik, 160)}.
Pertanyaan pemandu: ${clean(b.pertanyaan, 200)}. Tujuan: ${tujuan}. Produk: ${clean(b.produk, 200)}.

Keluarkan JSON: {"lkpd":{"petunjuk":"","langkah":["5 sampai 6 langkah kerja"],"pertanyaan":["4 pertanyaan refleksi siswa"]},"rubrik":[{"kriteria":"","baru":"","berkembang":"","cakap":"","mahir":""}],"asesmen":{"formatif":"","sumatif":""},"refleksi":["3 pertanyaan refleksi guru"]}.
Aturan: rubrik tepat 5 kriteria: Sains, Teknologi, Teknik, Matematika, Kolaborasi dan komunikasi; deskriptor singkat, dapat diamati, bahasa sederhana; langkah LKPD dapat dikerjakan siswa SD secara mandiri.`,
    };
  },
  // ---- Modul Ajar Mendalam, bagian 1: identitas, materi, TP, desain umum ----
  modul1(b) {
    const topik = clean(b.topik, 400) || clean(b.bab, 150);
    if (!topik || !clean(b.mapel, 80)) throw new Error('Mapel dan topik wajib diisi');
    const n = num(b.pertemuan, 4, 1, 12), jp = num(b.jpPer, 3, 1, 6);
    const sumber = clean(b.sumber_teks, 3000);
    const tpTeks = clean(b.tpTeks, 800);
    return {
      max: 2800,
      user: `Susun bagian awal Modul Ajar format Pembelajaran Mendalam (Deep Learning) Kurikulum Merdeka untuk SD.
- Mata pelajaran: ${clean(b.mapel, 80)}; kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}); semester ${clean(b.semester, 14)}; tahun pelajaran ${clean(b.tahun, 14)}
- Bab/judul: ${clean(b.bab, 150) || '-'}
- Topik/materi pokok: ${topik}
- Alokasi: ${n} pertemuan x ${jp} JP (${num(b.menit, 35, 20, 60)} menit per JP)
- Model pembelajaran: ${clean(b.model, 60)}; sintaks: ${(Array.isArray(b.sintaks) ? b.sintaks : []).slice(0, 8).map((x) => clean(x, 60)).join(' > ')}
- Kondisi kelas: ${clean(b.catatan, 200) || '-'}
${tpTeks ? `- Tujuan pembelajaran dari guru (pertahankan maknanya, boleh dirapikan):\n${tpTeks}\n` : ''}${sumber ? `- SUMBER MATERI (acuan utama, jangan menambah fakta di luar sumber):\n"""\n${sumber}\n"""\n` : ''}- Dimensi profil lulusan yang boleh dipakai: ${(Array.isArray(b.dplT) ? b.dplT : []).slice(0, 8).map((x) => clean(x, 40)).join('; ')}

Keluarkan JSON: {"pengetahuan_awal":"2 kalimat","minat":"2 kalimat","kebutuhan":"2 kalimat","materi":{"faktual":"","konseptual":"","prosedural":"","metakognitif":""},"dpl":[{"nama":"salah satu dimensi di atas","deskripsi":"kegiatan yang mengembangkannya"}],"tp":[{"pertemuan":"1-2","rumusan":"Peserta didik mampu ... (ada kriteria terukur, mis. minimal 80%)"}],"lintas":["Mapel A x Mapel B – penjelasan"],"judul_topik":"","metode":"","kemitraan":{"guru_siswa":"","siswa_siswa":""},"lingkungan":{"fisik":"","sosial":"","psikologis":""},"digital":[""]}.
Aturan: dpl 3 sampai 5 dimensi; tp 3 sampai 5 butir dan rentang "pertemuan" harus berurutan menutupi pertemuan 1 sampai ${n} tanpa celah (mis. 1-2, 3-5, 6-7); tiap rumusan TP diawali "Peserta didik mampu" dan terukur; lintas 2 butir; metode berupa daftar dipisah koma; kegiatan sesuai usia SD dan bahan mudah didapat; jangan mengarang fakta ilmiah.`,
    };
  },

  // ---- Modul Ajar Mendalam, bagian 2: satu pertemuan lengkap + LKM ----
  modulp(b) {
    const sint = (Array.isArray(b.sintaks) ? b.sintaks : []).slice(0, 8).map((x) => clean(x, 60));
    if (!sint.length) throw new Error('Sintaks kosong');
    const no = num(b.no, 1, 1, 12), total = num(b.total, 1, 1, 12);
    const sumber = clean(b.sumber_teks, 2500);
    return {
      max: 2800,
      user: `Susun langkah pembelajaran PERTEMUAN ${no} dari ${total} untuk Modul Ajar Pembelajaran Mendalam SD.
- Mata pelajaran: ${clean(b.mapel, 80)}; kelas ${clean(b.kelas, 3)} (Fase ${clean(b.fase, 2)}); bab/topik: ${clean(b.bab, 150) || clean(b.topik, 150)}; materi pokok: ${clean(b.topik, 300)}
- Tujuan pembelajaran pertemuan ini: ${clean(b.tpIni, 400)}
- Seluruh TP modul: ${(Array.isArray(b.tpSemua) ? b.tpSemua : []).slice(0, 6).map((x) => clean(x, 220)).join(' | ')}
- Model: ${clean(b.model, 60)}; sintaks berurutan: ${sint.map((x, i) => `${i + 1}. ${x}`).join('; ')}
- Waktu: kegiatan awal ${num(b.menitAwal, 15, 5, 30)} menit, inti ${num(b.menitInti, 80, 20, 200)} menit, akhir ${num(b.menitAkhir, 10, 5, 30)} menit
- Kondisi kelas: ${clean(b.catatan, 200) || '-'}
${sumber ? `- SUMBER MATERI (acuan, jangan menambah fakta di luar sumber):\n"""\n${sumber}\n"""\n` : ''}
Keluarkan JSON: {"tujuan_khusus":"Peserta didik mampu ... (khusus pertemuan ini)","awal":["5 langkah"],"inti":["tepat ${sint.length} butir, satu untuk setiap sintaks sesuai urutan"],"akhir":["4 sampai 5 langkah"],"asesmen":{"awal":"","proses":"","akhir":""},"lkm":{"judul":"LKM ${no} – judul menarik","instruksi":"petunjuk untuk siswa","isi":["3 sampai 6 butir tugas/soal yang benar-benar bisa dikerjakan siswa, tulis isi soalnya lengkap"],"refleksi":"kalimat refleksi dengan titik-titik isian"}}.
Aturan: kegiatan awal memuat salam dan doa, apersepsi, motivasi, dan penyampaian tujuan; beri penanda prinsip pembelajaran mendalam di akhir langkah: (Berkesadaran), (Bermakna), atau (Menggembirakan); tiap butir inti ditutup penanda dimensi profil dalam kurung, mis. (Bernalar Kritis, Kolaborasi), dan menjelaskan kegiatan guru DAN peserta didik secara konkret (jumlah kelompok, bahan, contoh pertanyaan); akhir memuat simpulan, refleksi, umpan balik, informasi pertemuan berikutnya, doa; asesmen awal=diagnostik singkat, proses=observasi/hasil kerja, akhir=instrumen dan target ketercapaian; semua sesuai usia SD, bahan mudah didapat; pertemuan ini harus melanjutkan pertemuan sebelumnya dan tidak mengulang isi pertemuan lain.`,
    };
  },

  // ---- Modul Ajar Mendalam, bagian 3: soal dan media ----
  modul3(b) {
    const tp = (Array.isArray(b.tpSemua) ? b.tpSemua : []).slice(0, 6).map((x, i) => `TP ${i + 1}: ${clean(x, 220)}`).join('\n');
    if (!tp) throw new Error('TP kosong');
    return {
      max: 2400,
      user: `Buat lampiran soal dan media untuk Modul Ajar SD.
- Mata pelajaran: ${clean(b.mapel, 80)}; kelas ${clean(b.kelas, 3)}; topik: ${clean(b.topik, 300)}
${tp}

Keluarkan JSON: {"soal_awal":[{"q":"","a":"jawaban/kunci"}],"soal_formatif":[{"tp":"TP 1","q":""}],"media":[""]}.
Aturan: soal_awal tepat 5 soal diagnostik ringan tentang pengetahuan awal topik ini, tiap soal punya jawaban/kunci (bila terbuka tulis contoh jawaban dan "kebijaksanaan guru"); soal_formatif tepat 1 soal per TP ditambah 1 soal integratif berlabel "Integratif", isinya lengkap dan bisa langsung dikerjakan (bila pilihan ganda tulis opsi a, b, c di dalam q); media 8 sampai 10 butir alat/bahan/media yang konkret dan mudah didapat; bahasa sesuai usia SD; jangan mengarang fakta ilmiah.`,
    };
  },

  // ---- Modul Ajar Mendalam, bagian 4: ringkasan materi dan rubrik ----
  modul4(b) {
    const tp = (Array.isArray(b.tpSemua) ? b.tpSemua : []).slice(0, 6).map((x, i) => `TP ${i + 1}: ${clean(x, 220)}`).join('\n');
    if (!tp) throw new Error('TP kosong');
    const m = b.materi && typeof b.materi === 'object' ? b.materi : {};
    return {
      max: 2800,
      user: `Buat ringkasan materi (bahan ajar) dan rubrik penilaian 4 skala untuk Modul Ajar SD.
- Mata pelajaran: ${clean(b.mapel, 80)}; kelas ${clean(b.kelas, 3)}; topik: ${clean(b.topik, 300)}
- Materi: faktual: ${clean(m.faktual, 200)}; konseptual: ${clean(m.konseptual, 300)}; prosedural: ${clean(m.prosedural, 200)}
${tp}

Keluarkan JSON: {"ringkasan":[{"judul":"sub materi","isi":"penjelasan singkat dengan contoh, boleh daftar bernomor dengan \\n"}],"rubrik_sikap":[{"aspek":"","l4":"Sangat Baik","l3":"Baik","l2":"Cukup","l1":"Perlu Bimbingan"}],"rubrik_pengetahuan":[{"aspek":"","l4":"","l3":"","l2":"","l1":""}],"rubrik_keterampilan":[{"aspek":"","l4":"","l3":"","l2":"","l1":""}]}.
Aturan: ringkasan 4 sampai 6 sub materi sesuai TP, bahasa ramah anak SD dan ringkas, jangan mengarang fakta; rubrik_sikap 3 sampai 4 aspek dimensi profil lulusan (mis. Bernalar Kritis, Mandiri, Komunikasi, Kolaborasi); rubrik_pengetahuan 3 aspek yang mengacu TP, deskriptor memakai kriteria terukur (mis. 4 dari 5 benar); rubrik_keterampilan 3 sampai 4 aspek unjuk kerja; deskriptor tiap level singkat, dapat diamati, bukan angka nilai.`,
    };
  },
};

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Respons AI tidak berformat JSON');
  try {
    return JSON.parse(m[0]);
  } catch {
    throw new Error('JSON dari AI tidak valid, coba lagi');
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const ctx = await gate(request, env);
    const b = await request.json();
    const t = tasks[b.task];
    if (!t) return json({ ok: false, error: 'Tugas tidak dikenal' }, 400);
    const { user, max } = t(b);
    const text = await askAI(env, ctx, SYS, user, max, 0.4);
    const data = parseJson(text);
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message ? e.message : e) }, (e && e.status) || 500);
  }
}
