# KelasKu — Administrasi Guru SD (Kurikulum Merdeka)

Aplikasi administrasi guru berbasis HTML, offline-first, tampilan 3D, dengan AI (Cloudflare Workers AI) untuk RPP Pembelajaran Mendalam, perangkat ajar, soal & LKPD, dan deskripsi rapor.

Design by Akhmad Fitra Harry, S.Pd

## Isi repositori (semua di folder utama, tanpa subfolder)
| Berkas | Fungsi |
|---|---|
| `index.html` | Seluruh aplikasi (tampilan dan logika) |
| `worker.js` | Pintu masuk Cloudflare: menampilkan aplikasi dan menyambungkan ke AI |
| `generate.js` | AI penyusun RPP |
| `extract.js` | Pembaca foto buku / PDF / Word |
| `tugas.js` | AI rapor, perangkat ajar, soal, LKPD |
| `wrangler.toml` | Pengaturan Cloudflare (nama proyek + AI) |

## Cara pasang
1. Unggah semua berkas di atas ke folder utama repositori GitHub (timpa yang bernama sama).
2. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → pilih repositori ini.
3. **Project name**: `administrasi-kelasku` (harus sama dengan `name` di `wrangler.toml`).
4. **Build command**: kosongkan. **Deploy command**: `npx wrangler deploy`.
5. Klik **Deploy**. Alamat: `https://administrasi-kelasku.<akun>.workers.dev`.

Setiap perubahan yang di-commit ke GitHub otomatis dipasang ulang oleh Cloudflare.

## Catatan
- Data tersimpan di perangkat (localStorage). Buat cadangan lewat **Pengaturan**.
- Tanpa internet/AI, RPP, rapor, dan perangkat ajar memakai template; soal dan LKPD butuh AI online.
- Google Drive otomatis: isi Google Client ID di Pengaturan; Authorized JavaScript origin = alamat `workers.dev` Anda.
- Kuota gratis Workers AI terbatas per hari. Untuk mencegah penyalahgunaan, pertimbangkan Rate Limiting di Cloudflare.
