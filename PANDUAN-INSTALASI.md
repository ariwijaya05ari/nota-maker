# PANDUAN INSTALASI — Nota Maker JanSae v1.0

Panduan ini membantu Anda memasang aplikasi pembuat nota dari nol. Kerjakan berurutan. Setiap tahap punya cara cek untuk memastikan berhasil.

---

## 0. Yang Anda terima

| Berkas | Tempat pakai |
|---|---|
| `Kode.gs` | Editor Apps Script (disalin-tempel) |
| `appsscript.json` | Editor Apps Script (manifest, disalin-tempel) |
| `frontend.zip` | Diekstrak, lalu didorong ke GitHub Pages |
| `PANDUAN-INSTALASI.md` | Dibaca ini |

Yang **tidak** ikut dalam ZIP: `Kode.gs` dan `appsscript.json`. Backend sengaja dipisah agar struktur folder frontend tetap rapi.

---

## 1. Siapkan akun dan nama situs

1. Pastikan Anda punya akun Google (Gmail atau Workspace) yang akan menjadi **pemilik** aplikasi. Akun ini juga menerima kuota email dan memiliki semua data.
2. Buat akun GitHub di https://github.com jika belum punya. Catat **username** Anda. Alamat situs nanti berbentuk `https://USERNAME.github.io`.

---

## 2. Buat Google OAuth Client ID (untuk login Google)

1. Buka https://console.cloud.google.com lalu buat proyek baru, misalnya `nota-maker`.
2. Menu **APIs & Services → OAuth consent screen**:
   - User type: **External**, lalu isi nama aplikasi dan email Anda.
   - Di bagian **Test users**, tambahkan email pemilik. Selama status masih *Testing*, hanya email di daftar ini yang bisa login Google.
3. Menu **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: isi `https://USERNAME.github.io` (ganti USERNAME dengan username GitHub Anda). Tidak perlu path atau tanda `/` di akhir.
   - Klik **Create**, lalu salin **Client ID**. Bentuknya `xxxx.apps.googleusercontent.com`.

Client ID bukan rahasia, tetapi tetap disimpan di Script Properties (langkah 3d).

---

## 3. Pasang backend di Google Apps Script

### 3a. Buat proyek
1. Buka https://script.google.com → **Proyek Baru**.
2. Hapus isi `Code.gs` bawaan. Ganti nama berkas menjadi `Kode` (klik nama berkas).
3. Tempel seluruh isi `Kode.gs` ke editor.
4. Buka **Setelan Proyek** (ikon roda gigi) → centang **Tampilkan berkas manifes appsscript.json**. Lalu buka `appsscript.json` dan ganti isinya dengan isi berkas `appsscript.json` dari paket.

### 3b. Jalankan setup (sekali, aman diulang)
1. Di bagian atas editor, pilih fungsi **setupAppEnvironment** lalu klik **▶ Jalankan**.
2. Klik **Tinjau izin**, pilih akun pemilik, lalu klik **Lanjutan → Buka (nama proyek) (tidak aman)**. Ini muncul karena aplikasi Anda sendiri belum diverifikasi Google. Aman untuk dilanjutkan.
3. Izinkan akses Drive, Sheets, Docs, dan Gmail.
4. Buka **Eksekusi** (log). Pastikan ada baris *✅ Setup selesai*. Catat lokasi spreadsheet dan folder Drive yang tercetak.

Setup membuat otomatis: folder *JanSae Nota Maker* (dengan subfolder *Logo* dan *Nota PDF*), spreadsheet database dengan sheet `Pengaturan`, `Pelanggan`, `Nota`, `DetailNota`, `Pengguna`, `AuditLog`, `AppConfig`, serta templat nota Google Docs. Setup juga membuat `SESSION_SECRET` secara acak dan menambahkan email Anda sebagai admin di sheet `Pengguna`.

> Jalankan `setupAppEnvironment` **berulang pun aman**. Yang sudah ada tidak ditimpa.

### 3c. Deploy sebagai Web App
1. Klik **Deploy → New deployment → ⚙️ Select type → Web app**.
2. Isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Klik **Deploy**, lalu salin **Web app URL** yang berakhiran `/exec`.

> **Catatan:** kami memakai **Anyone**, bukan "Anyone with Google account". Dengan pilihan kedua, halaman login tidak bisa mengambil Client ID secara publik. Keamanan tetap dijaga: setiap aksi mensyaratkan sesi yang berasal dari login Google yang terdaftar.

### 3d. Isi Client ID Google
1. Di proyek Apps Script, buka **Setelan Proyek → Script Properties → Tambahkan properti**.
2. Key: `GOOGLE_CLIENT_ID`, Value: Client ID dari langkah 2.
3. Simpan.

Cek sederhana: buka URL `/exec` Anda di browser dengan tambahan `?action=auth.config`. Hasilnya harus berisi `"googleClientId"` dengan nilai Client ID Anda.

---

## 4. Isi URL backend di frontend

1. Ekstrak `frontend.zip`.
2. Buka `js/config.js` dengan Notepad atau editor teks lain.
3. Ganti `https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec` dengan **Web app URL** dari langkah 3c.
4. Simpan.

> Hanya URL `/exec` yang boleh ada di frontend. Jangan pernah memasukkan token, kata sandi, atau Client Secret di folder ini.

---

## 5. Deploy frontend ke GitHub Pages (lewat terminal)

Kerjakan langkah ini satu per satu. Jika ada pesan error, cocokkan dengan tabel di bagian Troubleshooting.

### 5a. Pasang Git
- **Windows**: unduh di https://git-scm.com/download/win dan pasang dengan pengaturan default. Setelah itu buka **PowerShell** dari Start Menu.
- **Mac**: buka Terminal, ketik `git --version`. Jika belum ada, macOS akan menawarkan pemasangan otomatis.
- Cek: `git --version` harus menampilkan nomor versi.

### 5b. Atur identitas Git (sekali saja)
```
git config --global user.name "Nama Anda"
git config --global user.email "email-anda@gmail.com"
```
`user.name` hanya label di riwayat commit. Bebas diisi.

### 5c. Buat repository kosong di GitHub
1. Di github.com, klik **+ → New repository**.
2. Nama: `nota-maker` (atau nama lain). Pilih **Public**. Jika memakai Public, GitHub Pages gratis tersedia.
3. **Jangan** centang README, .gitignore, atau license.
4. Klik **Create repository**. Biarkan halaman ini terbuka.

### 5d. Pastikan folder yang benar
Ini langkah paling penting. Folder yang di-push harus berisi `index.html` **langsung di dalamnya**.

```
PowerShell:  cd "C:\Users\NAMA\Downloads\frontend"
             dir
Mac/Linux:   cd ~/Downloads/frontend
             ls
```
Baris pertama di hasil `dir`/`ls` harus memuat `index.html`, `css`, `js`, dan `README.md`. Jika yang terlihat malah folder `frontend` lagi di dalamnya, masuk satu tingkat lagi. **Jangan** menjalankan `git init` sebelum verifikasi ini.

### 5e. Inisialisasi dan kirim (push)
Dari folder yang sama dengan `index.html`:
```
git init
git add .
git commit -m "Nota Maker v1.0"
git branch -M main
git remote add origin https://github.com/USERNAME/nota-maker.git
git push -u origin main
```
Ganti `USERNAME` dan `nota-maker` sesuai repository Anda. Pada `git push`, GitHub meminta login:
- **Username**: username GitHub Anda.
- **Password**: **bukan** password akun. GitHub mewajibkan **Personal Access Token**.

Cara membuat token: GitHub → avatar → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**. Centang scope **repo**, lalu salin token. Saat diminta password di terminal, tempel token itu. Karakter tidak akan terlihat saat diketik. Itu normal.

### 5f. Aktifkan GitHub Pages
1. Buka repository di github.com → **Settings → Pages**.
2. Di bagian **Build and deployment → Source**, pilih **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Klik **Save**.
4. Tunggu 1 sampai 3 menit. Situs tersedia di `https://USERNAME.github.io/nota-maker/`.

---

## 6. Pertama kali memakai

1. Buka alamat situs. Klik **Masuk dengan Google**, lalu pilih akun pemilik.
2. Jika muncul "Akun tidak terdaftar", periksa sheet `Pengguna` di spreadsheet. Email harus ada dengan kolom `aktif` bernilai `TRUE`.
3. Buka **Pengaturan**:
   - Isi nama usaha, alamat, telepon, Instagram, dan catatan kaki nota.
   - Unggah logo (PNG atau JPG, maksimal 1 MB).
   - Atur prefiks nomor (default `JS-`) dan panjang digit.
4. Buka **Buat Nota**, isi data, lalu klik **Simpan & Buat PDF**.
5. Di halaman detail nota, gunakan tombol **Unduh PDF**, **Cetak**, atau **Kirim ke email pelanggan**.

### Yang dilakukan otomatis
- Nomor nota bertambah berurutan dan tidak pernah dobel.
- Total dihitung di server dari harga, diskon, dan pajak.
- Nota disimpan sebagai PDF di folder *Nota PDF*. Arsip ini bisa dibuka kapan saja dari Drive.
- Pelanggan yang sudah pernah dicatat akan disarankan saat Anda mengetik namanya.

---

## 7. Keamanan

### Script Properties (rahasia & identitas)
| Key | Diisi oleh | Keterangan |
|---|---|---|
| `SPREADSHEET_ID` | otomatis | ID database |
| `ROOT_FOLDER_ID`, `LOGO_FOLDER_ID`, `PDF_FOLDER_ID` | otomatis | Folder Drive |
| `TEMPLATE_DOC_ID` | otomatis | Templat nota Google Docs |
| `SESSION_SECRET` | otomatis | Kunci penandatangan sesi (jangan dibagikan) |
| `GOOGLE_CLIENT_ID` | **Anda** (langkah 3d) | Client ID OAuth, boleh terlihat publik |

### Aturan penting
- **Jangan bagikan** editor proyek Apps Script ke orang yang tidak dipercaya. Editor bisa melihat Script Properties.
- **Jangan bagikan** spreadsheet database ke orang lain. Gunakan tombol Pengaturan untuk mengubah data, bukan membuka sheet langsung.
- **Jangan** menambahkan token atau kata sandi ke frontend atau repository GitHub. Repo publik dapat dilihat siapa saja.
- Sesi login berlaku **12 jam**. Jika perangkat hilang, buka editor Apps Script, cari fungsi `cabutSemuaSesi`, ganti `EMAIL_YANG_DICABUT@contoh.com` dengan email yang sesinya ingin dicabut, simpan, lalu klik **▶ Jalankan**. Sesi email itu langsung tidak berlaku.
- Untuk menambah atau mencabut akses pengguna lain, ubah kolom `aktif` di sheet `Pengguna`. Perubahan berlaku dalam 5 menit.

---

## 8. Perawatan, kuota, dan performa

- **Kuota email**: akun Gmail biasa 100 email per hari. Dashboard menampilkan sisanya. Setelah habis, nota tetap bisa diunduh dan dicetak. Akun Workspace memiliki kuota lebih besar. Nilainya dapat diubah di `Kode.gs` pada konstanta `KUOTA_EMAIL_MAKS`.
- **Cache**: daftar nota dan beranda disimpan 5 menit. Setiap penyimpanan langsung menghapus cache terkait, jadi data baru tampil segera.
- **Mengedit templat PDF**: buka folder *JanSae Nota Maker* di Drive, lalu buka *Templat Nota — JanSae*. Anda bisa mengubah font, warna, dan tata letak secara langsung. **Jangan ubah teks placeholder** berbentuk `{{NAMA}}`. Daftar placeholder: `NAMA_USAHA, SLOGAN, ALAMAT_USAHA, KONTAK, NO_NOTA, TANGGAL, STATUS, PELANGGAN, ALAMAT_PELANGGAN, SUBTOTAL, DISKON, PAJAK, TOTAL, TERBILANG, CATATAN, TTD_NAMA, LOGO`.
- **Batas waktu Apps Script** 6 menit per eksekusi. Pembuatan satu nota jauh di bawah batas itu.

---

## 9. Cutover dan data lama

Versi ini memulai database baru yang kosong. **Data dari sistem lama tidak ikut pindah.** Jika nanti perlu memindahkan nota lama, beri tahu kami. Kami akan menyiapkan modul impor yang aman diulang, dengan simulasi (dry-run) sebelum penulisan.

Sesi login juga tidak terbawa. Setiap pengguna cukup masuk ulang.

---

## 10. Hal yang belum ada di v1.0

Sesuai keputusan pada PRD, fitur berikut ditunda ke versi berikutnya:
- Ongkos kirim dan metode pembayaran (sesuai keputusan awal).
- Notifikasi WhatsApp, termasuk gateway dan token.
- Cetak struk thermal Bluetooth (ESC/POS). v1.0 memakai cetak browser dengan ukuran 58 atau 80 mm.
- Katalog produk, cetak batch, piutang, dan tampilan audit trail.

Status pembayaran **LUNAS / BELUM LUNAS** sudah tersedia sebagai status sederhana.

---

## 11. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Tombol login tidak muncul, ada pesan "Client ID belum diatur" | `GOOGLE_CLIENT_ID` belum diisi | Ulangi langkah 3d |
| Login Google muncul pesan "origin_mismatch" | Origin di OAuth belum sama dengan alamat situs | Periksa **Authorized JavaScript origins** di Google Cloud, harus `https://USERNAME.github.io` |
| "Akun ... tidak terdaftar" | Email tidak ada di sheet `Pengguna` atau kolom `aktif` bukan TRUE | Tambahkan atau aktifkan di sheet |
| "Sesi berakhir" muncul terus | Token kedaluwarsa, atau `SESSION_SECRET` diubah | Masuk ulang |
| Situs tampil tanpa style atau tombol tidak berfungsi | File `css/` atau `js/` tidak terbawa ke repo | Pastikan `git add .` dijalankan dari folder yang berisi `index.html` |
| Situs 404 | `index.html` tidak di root repo, atau Pages belum aktif | Cek langkah 5d dan 5f |
| `git push` meminta password lalu gagal | Password akun tidak diterima | Gunakan Personal Access Token (langkah 5e) |
| "Password authentication is not supported" | Sama seperti di atas | Gunakan token |
| Perubahan frontend tidak terlihat | Cache browser | Tekan Ctrl+Shift+R |
| "Kuota email harian habis" | Batas 100 email per hari tercapai | Tunggu reset pukul 00:00 WIB. Nota tetap bisa diunduh |
| Nomor telepon kehilangan angka 0 di depan | Sheets mengubah format angka | Jalankan ulang `setupAppEnvironment`. Kolom telepon diatur sebagai teks |
| Gagal membuat PDF | Templat Docs atau logo bermasalah | Pastikan `TEMPLATE_DOC_ID` ada di Drive. Jika logo rusak, unggah ulang di Pengaturan |
| Backend mengembalikan "Aksi tidak dikenal" | `config.js` mengarah ke deployment yang salah | Pastikan URL `/exec` benar dan deploy ulang dengan New version setelah perubahan kode |

### Setelah mengubah `Kode.gs`
Pada Apps Script, pilih **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Jangan membuat **New deployment**, karena URL akan berubah dan `config.js` harus diisi ulang.

---

## 12. Ringkasan cek akhir

- [ ] `?action=auth.config` mengembalikan `googleClientId`.
- [ ] Login Google berhasil dan dashboard tampil.
- [ ] Satu nota uji tersimpan, PDF terbuat, dan logo tampil.
- [ ] Unduh, cetak, dan kirim email berhasil. Kirim ke email pribadi Anda dulu untuk uji.
- [ ] Pencarian dan filter daftar nota berfungsi.
- [ ] Buka di ponsel dan di desktop.
