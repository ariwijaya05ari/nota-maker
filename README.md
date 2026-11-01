# Nota Maker — Frontend (JanSae Konveksi)

Frontend statis (HTML, CSS, JavaScript vanilla). Backend ada di Google Apps Script, tidak termasuk paket ini.

## Isi

```
index.html        ← halaman utama (root repository)
README.md
css/style.css     ← gaya Blueprint Monolith (monokrom)
js/config.js      ← isi GAS_URL di sini (satu-satunya pengaturan)
js/api.js         ← lapisan fetch ke backend
js/app.js         ← logika aplikasi
```

## Sebelum deploy

1. Buka `js/config.js`.
2. Ganti `GANTI_DENGAN_ID_DEPLOYMENT` dengan ID deployment Web App dari Apps Script, sehingga URL lengkapnya berakhiran `/exec`.
3. Simpan file.

Panduan lengkap ada di `PANDUAN-INSTALASI.md`.
