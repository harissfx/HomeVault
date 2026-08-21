# Vault — Frontend

Frontend React (Vite + Tailwind) buat storage-api. Tampilan "ledger/deposit vault" — file ditampilkan sebagai manifes bernomor, upload lewat "slot penyimpanan".

## Jalan di lokal

```bash
npm install
cp .env.example .env
# .env default sudah nunjuk ke http://localhost:4000, sesuaikan kalau perlu
npm run dev
```

Buka `http://localhost:3000`. Pastikan backend `storage-api` sudah jalan duluan di `http://localhost:4000`.

## Ganti alamat server tanpa deploy ulang

Klik ikon gerigi (⚙) di pojok kanan atas → isi **Alamat API** dan **API Key** → Simpan. Ini disimpan di `localStorage` browser, jadi kalau nanti link ngrok kamu berubah tiap restart, tinggal update di sini — gak perlu redeploy frontend ke Vercel.

## Deploy ke Vercel

```bash
npm run build
```

Push folder ini ke GitHub, import ke Vercel (framework preset: Vite). Set environment variable `VITE_API_URL` dan `VITE_API_KEY` di dashboard Vercel kalau mau default awal sudah terisi — tapi tetap bisa diubah dari UI kapan saja.

## Catatan soal CORS

Backend (`storage-api`) membatasi origin lewat `ALLOWED_ORIGINS`. Setelah deploy ke Vercel, tambahkan domain Vercel kamu (misal `https://vault-kamu.vercel.app`) ke `.env` backend.
