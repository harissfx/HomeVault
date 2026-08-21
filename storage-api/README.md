# Storage API

Backend penyimpanan file pribadi. Jalan di STB, nyimpen file ke flashdisk 2.

## Endpoint

Semua endpoint (kecuali `/api/health`) wajib header:
`Authorization: Bearer <API_KEY>`

| Method | Path                  | Fungsi                          |
|--------|-----------------------|----------------------------------|
| GET    | /api/health           | Cek server hidup (publik)       |
| GET    | /api/files             | Daftar semua file                |
| POST   | /api/upload             | Upload file (field: `file`)     |
| GET    | /api/files/:filename    | Download file                    |
| DELETE | /api/files/:filename    | Hapus file                       |

## Setup di STB

1. Copy folder `storage-api` ini ke STB (misal ke `/mnt/usb2/storage-api` kalau flashdisk 2 di-mount di `/mnt/usb2`)
2. Copy `.env.example` jadi `.env`, isi `API_KEY` (generate token acak: `openssl rand -hex 32`) dan `STORAGE_DIR` (arahkan ke folder di flashdisk 2, misal `/mnt/usb2/storage`)
3. `npm install`
4. Test manual dulu: `node index.js`
5. Kalau lancar, jalankan pakai pm2 (sama seperti bot Telegram sebelumnya):
   ```
   pm2 start index.js --name storage-api
   pm2 save
   ```

## Test cepat pakai curl

```bash
# Cek server hidup
curl http://localhost:4000/api/health

# Upload file
curl -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer TOKEN_KAMU" \
  -F "file=@/path/ke/file.jpg"

# Lihat daftar file
curl http://localhost:4000/api/files \
  -H "Authorization: Bearer TOKEN_KAMU"
```

## Setelah frontend Vercel jadi

Update `ALLOWED_ORIGINS` di `.env` dengan domain Vercel kamu (misal `https://cloud-kamu.vercel.app`), lalu restart:
```
pm2 restart storage-api --update-env
```
