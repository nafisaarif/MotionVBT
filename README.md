# MotionVBT

Aplikasi pengukuran latihan Velocity Based Training (VBT), analisis kecepatan lari, dan pemantauan performa atlet.

## Fitur utama

- Pengukuran kecepatan gerak berbasis kamera
- Mode dua perangkat melalui QR
- Analisis sprint
- Riwayat latihan dan akun email
- Antarmuka responsif untuk Android dan iPhone

## Menjalankan secara lokal

Persyaratan: Node.js 22 atau lebih baru.

```bash
npm install
npm run dev
```

Aplikasi menggunakan Supabase untuk autentikasi akun email.

## Deploy ke Cloudflare Workers

Repositori ini adalah aplikasi Worker, bukan situs Pages statis. Sebelum deploy
pertama, buat database D1 untuk sinkronisasi sprint dua perangkat:

```bash
npx wrangler login
npx wrangler d1 create motionvbt
```

Salin nilai `database_id` dari hasil perintah tersebut ke `wrangler.jsonc`,
menggantikan UUID nol. Setelah itu terapkan skema dan deploy:

```bash
npx wrangler d1 migrations apply motionvbt --remote
npm run deploy
```

Untuk Cloudflare Builds (Git integration), gunakan:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Node.js version: `22`

Supabase URL dan publishable key memang digunakan oleh browser untuk login.
Jangan menambahkan Supabase secret key atau service-role key ke repositori.
