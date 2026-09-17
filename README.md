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
