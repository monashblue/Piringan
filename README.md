# Piringan

Pemutar musik statis dengan tampilan bergaya perangkat hi-fi lama:
- **Metadata** (judul, artis, album, sampul) diambil dari **Deezer API** (pencarian katalog publik, gratis, tanpa API key/login sama sekali).
- **Audio** diputar lewat **YouTube IFrame Player** resmi — video ditampilkan kecil di "layar CRT" di panel pemutar (bukan disembunyikan), karena begitulah cara resmi YouTube mengizinkan pemutaran melalui embed. Tidak ada proses unduh maupun ekstraksi audio di server.
- Tidak ada iklan, tidak ada akun, tidak ada tracking, tidak ada database — murni halaman statis + dua serverless function kecil di Vercel.

## Kenapa arsitekturnya begini

Awalnya proyek ini memakai Spotify Web API untuk metadata, tapi sejak akhir 2024 Spotify mewajibkan akun **pemilik app** (di Developer Dashboard) punya langganan Premium aktif untuk endpoint `/search` — walau cuma dipakai lewat Client Credentials Flow (tanpa login user sama sekali). Karena syarat itu tidak selalu bisa dipenuhi, metadata diganti ke **Deezer**, yang endpoint pencariannya publik dan tidak mensyaratkan akun/API key apa pun.

Untuk audio: Spotify juga sudah tidak mengizinkan pemutaran full-track lewat Web API tanpa Premium + Web Playback SDK (butuh login OAuth per pengguna), jadi audio sebenarnya tetap diambil dari YouTube lewat embed resminya (`youtube.com/iframe_api`). Judul lagu + nama artis dari Deezer dipakai sebagai kata kunci untuk mencari video yang paling cocok di YouTube — jadi kecocokan bergantung pada hasil pencarian dan tidak selalu sempurna.

## Struktur file

```
piringan/
├── index.html          halaman utama
├── styles.css           tampilan (tema kayu/kuningan/LCD retro)
├── script.js             logika pencarian, pemutaran, kontrol
├── api/
│   ├── deezer-search.js     proxy pencarian Deezer (serverless)
│   └── youtube-search.js    proxy pencarian video YouTube (serverless)
├── manifest.json         Web App Manifest (untuk PWA/APK)
├── sw.js                 service worker (cache shell, offline dasar)
├── icon-*.png            ikon aplikasi
├── package.json
├── .env.example
└── .gitignore
```

Deezer tidak butuh kredensial sama sekali. API key YouTube **hanya** dipakai di dalam fungsi serverless (`/api/youtube-search.js`), tidak pernah dikirim ke browser.

## Kombinasi shuffle x repeat

Ada 6 kombinasi utama, yang pasti gw juga ga ngerti maksudnya apaan
| # | Shuffle | Repeat | Perilaku                                       |
| - | ------- | ------ | ---------------------------------------------- |
| 1 | OFF     | OFF    | Urut → berhenti                                |
| 2 | OFF     | ALL    | Urut → kembali ke awal                         |
| 3 | OFF     | ONE    | Lagu yang sama terus                           |
| 4 | ON      | OFF    | Acak tanpa pengulangan → berhenti              |
| 5 | ON      | ALL    | Acak tanpa pengulangan → buat siklus acak baru |
| 6 | ON      | ONE    | Lagu yang sedang diputar diulang terus         |


## Persiapan kredensial

Hanya satu yang dibutuhkan:

- **YouTube**: buka [console.cloud.google.com](https://console.cloud.google.com) → buat project → aktifkan **YouTube Data API v3** → buat **API key** di menu Credentials. Sebaiknya batasi key tersebut hanya untuk API ini di pengaturan pembatasan.

## Menjalankan secara lokal

```bash
npm install -g vercel   # jika belum ada
cp .env.example .env    # lalu isi YOUTUBE_API_KEY
vercel dev
```

## Deploy ke Vercel

1. Push folder ini ke sebuah repo GitHub.
2. Di [vercel.com/new](https://vercel.com/new), import repo tersebut (framework preset: **Other** — tidak perlu build command, tidak perlu output directory khusus).
3. Di **Project Settings → Environment Variables**, tambahkan `YOUTUBE_API_KEY`.
4. Deploy. Vercel otomatis mendeteksi `index.html` sebagai halaman statis dan folder `api/` sebagai serverless functions.

## Membungkus jadi APK Android (opsional)

Situs ini sudah disiapkan sebagai PWA (`manifest.json`, ikon, `sw.js`), jadi bisa dibungkus jadi APK lewat **Trusted Web Activity (TWA)** — APK ini secara teknis "cuma" Chrome yang menampilkan situsmu tanpa address bar, tapi berjalan dan terpasang seperti aplikasi Android biasa, memakai deployment Vercel yang sama (API tetap butuh koneksi internet, sama seperti versi web).

1. **Deploy dulu ke Vercel** sampai situsnya bisa diakses lewat HTTPS (contoh: `https://piringan-kamu.vercel.app`).
2. Buka **[pwabuilder.com](https://www.pwabuilder.com)**, masukkan URL situsmu, klik *Start*. PWABuilder akan memindai `manifest.json` dan `sw.js` yang sudah ada.
3. Pilih platform **Android**, lalu unduh paket APK/AAB yang dihasilkan (sudah termasuk keystore penandatanganan otomatis kalau kamu belum punya sendiri).
4. PWABuilder juga akan memberimu file `assetlinks.json` — unggah file ini ke `https://piringan-kamu.vercel.app/.well-known/assetlinks.json` (buat folder `.well-known/` di root proyek). Ini yang membuat Chrome mempercayai APK-mu sebagai "pemilik sah" situs tersebut sehingga address bar disembunyikan sepenuhnya.
5. Install APK hasil unduhan langsung ke HP Android (aktifkan "Install dari sumber tidak dikenal" jika perlu), atau unggah `.aab`-nya ke Google Play Console kalau mau distribusi resmi lewat Play Store.

Alternatif lain: **[Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap)** dari Google — lebih teknis (butuh Android SDK/JDK terpasang lokal) tapi prosesnya sama persis (baca manifest → generate proyek Android → build APK/AAB).

Catatan: pemutaran video YouTube di dalam WebView/TWA berperilaku sama seperti di Chrome biasa, jadi tidak perlu penyesuaian kode tambahan — kontrol autoplay tetap butuh interaksi pengguna (menekan tombol "Putar"), yang memang sudah begitu alurnya di aplikasi ini.

## Batasan yang perlu diketahui

- Kuota gratis YouTube Data API adalah 10.000 unit/hari; setiap pencarian memakai ±100 unit, jadi cukup untuk ±100 pencarian/hari sebelum kena limit.
- Karena pencarian video dilakukan otomatis berdasarkan judul+artis, sesekali video yang terpilih mungkin bukan versi audio resmi/terbaik — bisa disesuaikan lagi logikanya di `playTrackAt()` pada `script.js` bila mau menambah, misalnya, penyaringan tambahan.
- Ini proyek untuk pemakaian pribadi/pembelajaran; pastikan pemakaian API Deezer dan YouTube-mu tetap mengikuti ketentuan layanan masing-masing.

## Genre, riwayat, rekomendasi & lagu mirip

Semua fitur ini murni berjalan di sisi kamu (localStorage per-perangkat/per-browser) — tidak ada database, tidak ada akun, tidak ada data yang dikirim ke mana pun selain ke Deezer/YouTube untuk pencarian.

- **Genre**: `api/deezer-genre.js` mengambil genre dari endpoint album Deezer (`/album/{id}`), dipanggil sekali per lagu **saat lagunya benar-benar diputar** (bukan untuk semua hasil pencarian sekaligus), lalu di-cache di memori. Lagu dari fallback iTunes sudah langsung bawa genre dari `primaryGenreName`, tanpa request tambahan.
- **Riwayat mendengarkan**: disimpan di `localStorage` (`piringan_history`, maksimum 300 entri terakhir) tiap kali sebuah lagu mulai diputar (event `PLAYING` dari YouTube player, sekali per pemuatan video).
- **Rekomendasi** ("Rekomendasi" di bawah Playlist): diambil dari `api/deezer-related.js` berdasarkan 3 artis yang paling sering muncul di riwayatmu, dikurangi lagu yang sudah pernah kamu putar.
- **Lagu mirip** ("Mirip dengan ini", muncul otomatis di bawah rekomendasi saat sebuah lagu diputar): dari artis yang sama + artis terkait versi Deezer (`/artist/{id}/related`), lewat endpoint yang sama (`deezer-related.js`).
- Karena butuh `artistId`/`albumId` dari Deezer, ketiga fitur di atas otomatis nonaktif (disembunyikan/kosong) untuk lagu yang datang dari fallback iTunes — Deezer tidak bisa dicocokkan balik ke katalog iTunes.
