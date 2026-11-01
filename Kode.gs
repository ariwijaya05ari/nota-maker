// ============================================================
// JANSAE NOTA MAKER — Kode.gs (Backend REST API)
// Deploy: Execute as: Me | Who has access: Anyone
// Semua komentar dan pesan dalam Bahasa Indonesia.
// Rahasia hanya di Script Properties (lihat PANDUAN-INSTALASI.md).
// ============================================================

const APP_VERSION = '1.0.0';
const TZ = 'Asia/Jakarta';
const SESI_JAM = 12;
const KUOTA_EMAIL_MAKS = 100;          // akun Gmail biasa. Workspace: 1500
const PER_HALAMAN = 20;

const SHEET = {
  config: 'AppConfig', pengaturan: 'Pengaturan', pelanggan: 'Pelanggan',
  nota: 'Nota', detail: 'DetailNota', pengguna: 'Pengguna', audit: 'AuditLog'
};

const HEADER = {
  AppConfig: ['key', 'value', 'keterangan'],
  Pengaturan: ['kunci', 'nilai'],
  Pelanggan: ['id', 'nama', 'alamat', 'telepon', 'email', 'dibuat'],
  Nota: ['id', 'nomor', 'tanggal', 'pelanggan_id', 'pelanggan_nama', 'subtotal',
    'diskon_persen', 'diskon_nilai', 'pajak_persen', 'pajak_nilai', 'total',
    'status_lunas', 'status_email', 'file_id', 'catatan', 'dibuat', 'diubah'],
  DetailNota: ['nota_id', 'urut', 'nama', 'qty', 'harga', 'subtotal'],
  Pengguna: ['email', 'nama', 'peran', 'aktif'],
  AuditLog: ['waktu', 'email', 'aksi', 'detail']
};

const PENGATURAN_DEFAULT = {
  nama_usaha: 'JanSae Konveksi',
  slogan: 'Konveksi Kaos • Bantal • Boneka',
  alamat: 'Jl. Industri Kreatif No. 21, Bandung',
  telepon: '0812-3456-7890',
  email: '',
  instagram: '@jansaekonveksi',
  prefiks: 'JS-',
  digit: '5',
  nomor_terakhir: '10245',
  catatan_default: 'Barang yang sudah dibeli tidak dapat dikembalikan tanpa nota fisik asli.',
  ttd_nama: 'JanSae Konveksi',
  logo_file_id: ''
};
const PENGATURAN_BOLEH_UBAH = ['nama_usaha', 'slogan', 'alamat', 'telepon', 'email',
  'instagram', 'prefiks', 'digit', 'catatan_default', 'ttd_nama'];

// ============================================================
// PROPERTI (satu pintu, dibaca sekali per eksekusi)
// ============================================================
const PROPS = PropertiesService.getScriptProperties();
let _PM = null;
function prop_(k, d) {
  if (!_PM) _PM = PROPS.getProperties();
  const v = _PM[k];
  return (v === undefined || v === null || v === '') ? (d === undefined ? '' : d) : v;
}
function setProp_(k, v) { PROPS.setProperty(k, String(v)); if (_PM) _PM[k] = String(v); }
function setProps_(o) {
  PROPS.setProperties(o);
  if (_PM) Object.keys(o).forEach(k => { _PM[k] = String(o[k]); });
}

// ============================================================
// ROUTE
// auth: true = wajib token sesi. bump = scope cache yang dihapus setelah aksi.
// ============================================================
const ROUTES = {
  'auth.login':        { fn: authLogin_ },
  'dashboard.get':     { auth: true, fn: dashboardGet_ },
  'pelanggan.list':    { auth: true, fn: pelangganList_ },
  'nota.list':         { auth: true, fn: notaList_ },
  'nota.get':          { auth: true, fn: notaGet_ },
  'nota.simpan':       { auth: true, fn: notaSimpan_, bump: ['nota', 'pelanggan'] },
  'nota.hapus':        { auth: true, fn: notaHapus_, bump: ['nota'] },
  'nota.pdf':          { auth: true, fn: notaPdf_ },
  'nota.kirimEmail':   { auth: true, fn: notaKirimEmail_, bump: ['nota'] },
  'pengaturan.get':    { auth: true, fn: pengaturanGet_ },
  'pengaturan.simpan': { auth: true, fn: pengaturanSimpan_, bump: ['pengaturan', 'nota'] },
  'logo.unggah':       { auth: true, fn: logoUnggah_, bump: ['pengaturan'] }
};

// ============================================================
// ENTRY POINTS
// ============================================================
function doGet(e) {
  const t0 = Date.now();
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'auth.config') {
      return out_(ok_({ googleClientId: prop_('GOOGLE_CLIENT_ID') }), t0);   // data publik
    }
    return out_(fail_('Gunakan POST untuk aksi ini.'), t0);
  } catch (err) {
    return out_(fail_(err.message), t0);
  }
}

function doPost(e) {
  const t0 = Date.now();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const route = ROUTES[String(body.action || '')];
    if (!route) return out_(fail_('Aksi tidak dikenal.'), t0);

    let sesi = null;
    if (route.auth) {
      sesi = verifyToken_(body.token);
      if (!sesi) return out_(fail_('Sesi berakhir. Silakan masuk ulang.', 401), t0);
      if (!getPenggunaAktif_(sesi.email)) return out_(fail_('Akses Anda sudah dicabut.', 403), t0);
    }

    const res = route.fn(body.data || {}, sesi);
    if (route.bump) route.bump.forEach(bump_);
    return out_(res, t0);
  } catch (err) {
    console.error('doPost: ' + err.message);
    return out_(fail_(err.message), t0);
  }
}

// ============================================================
// RESPONS & UTILITAS
// ============================================================
function ok_(data, pesan) { return { success: true, data: data || {}, message: pesan || '' }; }
function fail_(pesan, kode) { return { success: false, message: pesan, code: kode || 400 }; }

function out_(res, t0) {
  res.ms = Date.now() - t0;          // ukur waktu kerja server (gas-scale-turbo)
  res.v = APP_VERSION;
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function rp_(n) { return 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}
function tglIndo_(v) {
  const p = tglStr_(v).split('-').map(Number);
  return p.length === 3 && p[2] ? p[2] + ' ' + BULAN[p[1] - 1] + ' ' + p[0] : '-';
}

function persen_(v) { const n = Number(v); return n > 0 && n <= 100 ? n : 0; }

// Terbilang Indonesia untuk total nota
function terbilang_(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan',
    'Sembilan', 'Sepuluh', 'Sebelas'];
  function t(x) {
    if (x < 12) return satuan[x];
    if (x < 20) return t(x - 10) + ' Belas';
    if (x < 100) return t(Math.floor(x / 10)) + ' Puluh' + (x % 10 ? ' ' + t(x % 10) : '');
    if (x < 200) return 'Seratus' + (x - 100 ? ' ' + t(x - 100) : '');
    if (x < 1000) return t(Math.floor(x / 100)) + ' Ratus' + (x % 100 ? ' ' + t(x % 100) : '');
    if (x < 2000) return 'Seribu' + (x - 1000 ? ' ' + t(x - 1000) : '');
    if (x < 1000000) return t(Math.floor(x / 1000)) + ' Ribu' + (x % 1000 ? ' ' + t(x % 1000) : '');
    if (x < 1000000000) return t(Math.floor(x / 1000000)) + ' Juta' + (x % 1000000 ? ' ' + t(x % 1000000) : '');
    return String(x);
  }
  return t(n).replace(/\s+/g, ' ').trim() + ' Rupiah';
}

function acak_(n) {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  while (s.length < n) {
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid())
      .forEach(b => { if (s.length < n) s += huruf[(b & 0xff) % huruf.length]; });
  }
  return s;
}

// ============================================================
// CACHE BERVERSI (gas-scale-turbo): naikkan versi, bukan hapus kunci satu-satu
// ============================================================
function ver_(scope) {
  const c = CacheService.getScriptCache();
  let v = c.get('ver_' + scope);
  if (!v) { v = String(Date.now()); c.put('ver_' + scope, v, 21600); }
  return v;
}
function bump_(scope) {
  CacheService.getScriptCache().put('ver_' + scope, String(Date.now()) + Math.floor(Math.random() * 1000), 21600);
}
function cacheGet_(k) {
  try { const s = CacheService.getScriptCache().get(k); return s ? JSON.parse(s) : null; }
  catch (e) { return null; }
}
function cachePut_(k, v, ttl) {
  try {
    const s = JSON.stringify(v);
    if (s.length <= 95000) CacheService.getScriptCache().put(k, s, ttl);
  } catch (e) { /* abaikan: cache hanya optimasi */ }
}

// ============================================================
// AKSES SHEET (baca 1×, tulis seperlunya)
// ============================================================
function sheet_(name) {
  const sh = SpreadsheetApp.openById(prop_('SPREADSHEET_ID')).getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setupAppEnvironment().');
  return sh;
}
function tabel_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  return { sh: sh, headers: values[0].map(String), values: values };
}
function objek_(t) {
  const out = [];
  for (let i = 1; i < t.values.length; i++) {
    const r = t.values[i];
    if (!r.some(c => c !== '' && c !== null)) continue;
    const o = { _row: i + 1 };
    t.headers.forEach((h, j) => { if (h) o[h] = r[j]; });
    out.push(o);
  }
  return out;
}
function tulisBaris_(t, row, obj) {
  const nilai = t.headers.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : '');
  if (row) t.sh.getRange(row, 1, 1, nilai.length).setValues([nilai]);
  else t.sh.appendRow(nilai);
}
function setKolom_(t, row, kolom, nilai) {
  const col = t.headers.indexOf(kolom) + 1;
  if (col > 0) t.sh.getRange(row, col).setValue(nilai);
}
function auditTulis_(email, aksi, detail) {
  try { sheet_(SHEET.audit).appendRow([new Date(), email || '-', aksi, String(detail || '').slice(0, 300)]); }
  catch (e) { /* audit tidak boleh menggagalkan aksi utama */ }
}

// ============================================================
// AUTENTIKASI: Google ID token + sesi HMAC (gas-rahasia-script-properties)
// ============================================================
function secret_() {
  let s = prop_('SESSION_SECRET');
  if (!s) { s = acak_(64); setProp_('SESSION_SECRET', s); }
  return s;
}
function hmac_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())).replace(/=+$/, '');
}
function samaAman_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function buatSesi_(email, peran, nama) {
  const now = Date.now();
  const payload = { e: email, r: peran, n: nama || '', i: now, x: now + SESI_JAM * 3600e3 };
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');
  return body + '.' + hmac_(body);
}
function verifyToken_(t) {
  try {
    const parts = String(t || '').split('.');
    if (parts.length !== 2 || !samaAman_(hmac_(parts[0]), parts[1])) return null;
    let b = parts[0]; while (b.length % 4) b += '=';
    const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
    if (!p.x || p.x < Date.now()) return null;
    if (p.i < Number(prop_('REV_' + p.e, 0))) return null;     // sesi dicabut
    return { email: p.e, peran: p.r, nama: p.n || '' };
  } catch (e) { return null; }
}
// Jalankan dari editor bila perangkat seseorang hilang.
// Ganti email di bawah, lalu pilih fungsi ini dan klik Jalankan.
function cabutSemuaSesi() {
  const e = 'EMAIL_YANG_DICABUT@contoh.com'.toLowerCase();
  setProp_('REV_' + e, Date.now());
  Logger.log('Sesi untuk ' + e + ' dicabut.');
}

function verifyGoogleIdToken_(idToken) {
  const cid = prop_('GOOGLE_CLIENT_ID');
  if (!cid) throw new Error('GOOGLE_CLIENT_ID belum diisi di Script Properties.');
  if (!idToken) throw new Error('Token Google tidak ditemukan.');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Token Google tidak valid atau kedaluwarsa.');
  const p = JSON.parse(r.getContentText());
  if (p.aud !== cid) throw new Error('Token Google bukan untuk aplikasi ini.');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(p.iss) === -1) throw new Error('Penerbit token tidak dikenal.');
  if (String(p.email_verified) !== 'true') throw new Error('Email Google belum terverifikasi.');
  return { email: String(p.email).toLowerCase(), nama: p.name || '' };
}

function getPenggunaAktif_(email) {
  const e = String(email || '').toLowerCase();
  const key = 'aktif_' + ver_('pengguna') + '_' + e;
  const hit = cacheGet_(key);
  if (hit) return hit.p;
  const p = objek_(tabel_(SHEET.pengguna)).find(x =>
    String(x.email).toLowerCase() === e && (x.aktif === true || String(x.aktif).toUpperCase() === 'TRUE')) || null;
  cachePut_(key, { p: p }, 300);
  return p;
}

function authLogin_(d) {
  const info = verifyGoogleIdToken_(String(d.credential || ''));
  const p = getPenggunaAktif_(info.email);
  if (!p) {
    auditTulis_(info.email, 'LOGIN_DITOLAK', 'Akun tidak terdaftar atau nonaktif');
    return fail_('Akun ' + info.email + ' tidak terdaftar atau tidak aktif.', 403);
  }
  const nama = p.nama || info.nama;
  auditTulis_(info.email, 'LOGIN', 'Berhasil');
  return ok_({ token: buatSesi_(info.email, p.peran, nama), me: { email: info.email, nama: nama, peran: p.peran } });
}

// ============================================================
// PELANGGAN
// ============================================================
function pelangganList_() {
  const items = objek_(tabel_(SHEET.pelanggan)).map(p => ({
    id: p.id, nama: p.nama, alamat: p.alamat, telepon: String(p.telepon || ''), email: p.email
  }));
  return ok_({ items: items });
}

function simpanPelanggan_(p) {
  const nama = String(p.nama || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  const t = tabel_(SHEET.pelanggan);
  const ada = objek_(t).find(x =>
    (email && String(x.email).toLowerCase() === email) ||
    (!email && String(x.nama).toLowerCase() === nama.toLowerCase()));
  const obj = {
    id: ada ? ada.id : 'P' + Date.now().toString(36),
    nama: nama,
    alamat: String(p.alamat || '').slice(0, 240),
    telepon: String(p.telepon || '').trim(),
    email: email,
    dibuat: ada ? ada.dibuat : Date.now()
  };
  tulisBaris_(t, ada ? ada._row : null, obj);
  return obj;
}

// ============================================================
// PENGATURAN (key-value)
// ============================================================
function bacaPengaturan_() {
  const o = Object.assign({}, PENGATURAN_DEFAULT);
  tabel_(SHEET.pengaturan).values.slice(1).forEach(r => {
    if (r[0] !== '') o[String(r[0])] = r[1];
  });
  return o;
}
function setPengaturan_(kunci, nilai) {
  const t = tabel_(SHEET.pengaturan);
  for (let i = 1; i < t.values.length; i++) {
    if (String(t.values[i][0]) === kunci) { t.sh.getRange(i + 1, 2).setValue(String(nilai)); return; }
  }
  t.sh.appendRow([kunci, String(nilai)]);
}

function pengaturanGet_() {
  const s = bacaPengaturan_();
  const out = {};
  PENGATURAN_BOLEH_UBAH.concat(['nomor_terakhir']).forEach(k => { out[k] = s[k]; });
  out.logoAda = !!s.logo_file_id;
  return ok_(out);
}

function pengaturanSimpan_(d) {
  const digit = d.digit !== undefined ? Number(d.digit) : null;
  if (digit !== null && (!(digit >= 3 && digit <= 8))) return fail_('Panjang digit nomor harus 3 sampai 8.');
  const prefiks = d.prefiks !== undefined ? String(d.prefiks) : null;
  if (prefiks !== null && prefiks.length > 10) return fail_('Prefiks nomor maksimal 10 karakter.');
  PENGATURAN_BOLEH_UBAH.forEach(k => {
    if (d[k] !== undefined) setPengaturan_(k, String(d[k]).slice(0, 300));
  });
  return ok_({}, 'Pengaturan berhasil disimpan.');
}

function logoUnggah_(d) {
  const mime = String(d.mime || '');
  if (['image/png', 'image/jpeg'].indexOf(mime) === -1) return fail_('Format logo harus PNG atau JPG.');
  const bytes = Utilities.base64Decode(String(d.dataBase64 || ''));
  if (bytes.length > 1024 * 1024) return fail_('Ukuran logo maksimal 1 MB.');
  const ext = mime === 'image/png' ? '.png' : '.jpg';
  const file = DriveApp.getFolderById(prop_('LOGO_FOLDER_ID'))
    .createFile(Utilities.newBlob(bytes, mime, 'logo_' + Date.now() + ext));
  const lama = bacaPengaturan_().logo_file_id;
  if (lama) hapusFileAman_(lama);
  setPengaturan_('logo_file_id', file.getId());
  return ok_({ logoAda: true }, 'Logo berhasil disimpan.');
}

function hapusFileAman_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* file sudah tidak ada */ }
}

// ============================================================
// NOTA: nomor, total, simpan, daftar, detail
// ============================================================
function nomorBerikut_() {
  const s = bacaPengaturan_();
  const next = Number(s.nomor_terakhir || 0) + 1;
  setPengaturan_('nomor_terakhir', next);
  return String(s.prefiks || '') + String(next).padStart(Number(s.digit) || 5, '0');
}

function hitungNota_(d) {
  const items = Array.isArray(d.items) ? d.items : [];
  if (!String((d.pelanggan || {}).nama || '').trim()) throw new Error('Nama pelanggan wajib diisi.');
  if (!items.length) throw new Error('Minimal satu barang/jasa.');
  let sub = 0;
  const rows = items.map((it, i) => {
    const nama = String(it.nama || '').trim();
    const qty = Number(it.qty);
    const harga = Number(it.harga);
    if (!nama) throw new Error('Baris ' + (i + 1) + ': nama barang/jasa wajib diisi.');
    if (!(qty > 0)) throw new Error('Baris ' + (i + 1) + ': qty harus angka positif.');
    if (!(harga >= 0)) throw new Error('Baris ' + (i + 1) + ': harga tidak boleh negatif.');
    const s = Math.round(qty * harga);
    sub += s;
    return { nama: nama, qty: qty, harga: Math.round(harga), subtotal: s };
  });
  const dp = persen_(d.diskonPersen), pp = persen_(d.pajakPersen);
  const dn = Math.round(sub * dp / 100), base = sub - dn, pn = Math.round(base * pp / 100);
  return { rows: rows, subtotal: sub, diskonPersen: dp, diskonNilai: dn, pajakPersen: pp, pajakNilai: pn, total: base + pn };
}

function cariNota_(id) {
  return objek_(tabel_(SHEET.nota)).find(n => String(n.id) === String(id)) || null;
}

function ringkasNota_(n) {
  return {
    id: n.id, nomor: n.nomor, tanggal: tglStr_(n.tanggal), pelangganNama: n.pelanggan_nama,
    total: Number(n.total), statusLunas: n.status_lunas, statusEmail: n.status_email
  };
}

function detailNota_(n) {
  const pel = objek_(tabel_(SHEET.pelanggan)).find(p => String(p.id) === String(n.pelanggan_id)) || {};
  const items = objek_(tabel_(SHEET.detail))
    .filter(x => String(x.nota_id) === String(n.id))
    .sort((a, b) => Number(a.urut) - Number(b.urut))
    .map(x => ({ nama: x.nama, qty: Number(x.qty), harga: Number(x.harga), subtotal: Number(x.subtotal) }));
  return Object.assign(ringkasNota_(n), {
    subtotal: Number(n.subtotal), diskonPersen: Number(n.diskon_persen), diskonNilai: Number(n.diskon_nilai),
    pajakPersen: Number(n.pajak_persen), pajakNilai: Number(n.pajak_nilai), catatan: n.catatan || '',
    punyaPdf: !!n.file_id,
    pelanggan: { id: n.pelanggan_id, nama: pel.nama || n.pelanggan_nama, alamat: pel.alamat || '',
      telepon: String(pel.telepon || ''), email: pel.email || '' },
    items: items
  });
}

function notaList_(d) {
  const q = String(d.q || '').toLowerCase().trim();
  const status = String(d.status || 'semua');
  const dari = String(d.dari || ''), sampai = String(d.sampai || '');
  const page = Math.max(1, Number(d.page) || 1);
  const sig = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify([q, status, dari, sampai, page])).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  const key = 'list_' + ver_('nota') + '_' + sig;
  const hit = cacheGet_(key);
  if (hit) return ok_(hit);

  let rows = objek_(tabel_(SHEET.nota)).map(n => Object.assign({}, n, { tanggal: tglStr_(n.tanggal) }));
  rows = rows.filter(n => {
    if (q && !(String(n.nomor).toLowerCase().indexOf(q) > -1 || String(n.pelanggan_nama).toLowerCase().indexOf(q) > -1)) return false;
    if (dari && n.tanggal < dari) return false;
    if (sampai && n.tanggal > sampai) return false;
    if (status === 'lunas' && n.status_lunas !== 'LUNAS') return false;
    if (status === 'belum' && n.status_lunas !== 'BELUM LUNAS') return false;
    if (status === 'gagal' && n.status_email !== 'Gagal') return false;
    return true;
  }).sort((a, b) => Number(b.dibuat) - Number(a.dibuat));

  const res = {
    items: rows.slice((page - 1) * PER_HALAMAN, page * PER_HALAMAN).map(ringkasNota_),
    total: rows.length, page: page, perPage: PER_HALAMAN
  };
  cachePut_(key, res, 300);
  return ok_(res);
}

function notaGet_(d) {
  const n = cariNota_(d.id);
  if (!n) return fail_('Nota tidak ditemukan.', 404);
  return ok_(detailNota_(n));
}

// Tulis ulang rincian nota: hapus baris lama lalu tulis baru (dalam lock)
function tulisDetail_(notaId, rows) {
  const t = tabel_(SHEET.detail);
  objek_(t).filter(x => String(x.nota_id) === String(notaId))
    .map(x => x._row).sort((a, b) => b - a)
    .forEach(r => t.sh.deleteRow(r));
  if (rows.length) {
    const data = rows.map((r, i) => [notaId, i + 1, r.nama, r.qty, r.harga, r.subtotal]);
    t.sh.getRange(t.sh.getLastRow() + 1, 1, data.length, 6).setValues(data);
  }
}

function notaSimpan_(d, sesi) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('Server sedang sibuk. Coba lagi sebentar.', 503);
  try {
    const hitung = hitungNota_(d);
    const pel = simpanPelanggan_(d.pelanggan || {});
    const tNota = tabel_(SHEET.nota);
    const now = Date.now();

    let lama = null, nomor, id;
    if (d.id) {
      lama = objek_(tNota).find(n => String(n.id) === String(d.id));
      if (!lama) return fail_('Nota tidak ditemukan.', 404);
      nomor = lama.nomor; id = lama.id;
    } else {
      nomor = nomorBerikut_();
      id = 'N' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    }

    const nilai = {
      id: id, nomor: nomor, tanggal: tglStr_(d.tanggal) || tglStr_(new Date()),
      pelanggan_id: pel.id, pelanggan_nama: pel.nama,
      subtotal: hitung.subtotal, diskon_persen: hitung.diskonPersen, diskon_nilai: hitung.diskonNilai,
      pajak_persen: hitung.pajakPersen, pajak_nilai: hitung.pajakNilai, total: hitung.total,
      status_lunas: d.statusLunas === 'BELUM LUNAS' ? 'BELUM LUNAS' : 'LUNAS',
      status_email: lama ? lama.status_email : 'Belum dikirim',
      file_id: '', catatan: String(d.catatan || '').slice(0, 500),
      dibuat: lama ? lama.dibuat : now, diubah: now
    };

    const s = bacaPengaturan_();
    const pdf = buatPdf_(nomor, Object.assign({}, nilai, { pelanggan: pel, items: hitung.rows }), s);
    if (lama && lama.file_id) hapusFileAman_(lama.file_id);
    nilai.file_id = pdf.getId();

    tulisBaris_(tNota, lama ? lama._row : null, nilai);
    tulisDetail_(id, hitung.rows);
    auditTulis_(sesi && sesi.email, lama ? 'NOTA_UBAH' : 'NOTA_BUAT', nomor);
    return ok_({ id: id, nomor: nomor }, 'Nota ' + nomor + ' tersimpan.');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// PDF dari templat Google Docs (salin → isi → ekspor → buang salinan)
// ============================================================
function escRepl_(v) { return String(v === undefined || v === null ? '' : v).replace(/\\/g, '\\\\').replace(/\$/g, '\\$'); }

function buatPdf_(nomor, n, s) {
  const folder = DriveApp.getFolderById(prop_('PDF_FOLDER_ID'));
  const salinan = DriveApp.getFileById(prop_('TEMPLATE_DOC_ID')).makeCopy('tmp_' + nomor, folder);
  const doc = DocumentApp.openById(salinan.getId());
  const body = doc.getBody();

  const isi = {
    NAMA_USAHA: s.nama_usaha, SLOGAN: s.slogan, ALAMAT_USAHA: s.alamat,
    KONTAK: [s.telepon, s.email, s.instagram].filter(Boolean).join('  •  '),
    NO_NOTA: nomor, TANGGAL: tglIndo_(n.tanggal), STATUS: n.status_lunas,
    PELANGGAN: n.pelanggan.nama, ALAMAT_PELANGGAN: n.pelanggan.alamat || '-',
    SUBTOTAL: rp_(n.subtotal),
    DISKON: n.diskon_nilai ? '- ' + rp_(n.diskon_nilai) : '-',
    PAJAK: n.pajak_nilai ? rp_(n.pajak_nilai) : '-',
    TOTAL: rp_(n.total),
    TERBILANG: 'Terbilang: "' + terbilang_(n.total) + '"',
    CATATAN: n.catatan || s.catatan_default,
    TTD_NAMA: '( ' + s.ttd_nama + ' )'
  };
  Object.keys(isi).forEach(k => body.replaceText('\\{\\{' + k + '\\}\\}', escRepl_(isi[k])));

  const elLogo = body.findText('\\{\\{LOGO\\}\\}');
  if (elLogo) {
    const par = elLogo.getElement().getParent().asParagraph();
    par.clear();
    if (s.logo_file_id) {
      try {
        const img = par.appendInlineImage(DriveApp.getFileById(s.logo_file_id).getBlob());
        const w = 80;
        img.setWidth(w).setHeight(w * img.getHeight() / img.getWidth());
      } catch (e) { /* logo tidak terbaca: nota tetap dibuat tanpa logo */ }
    }
  }

  const tabel = body.getTables()[0];
  n.items.forEach((r, i) => {
    const baris = tabel.appendTableRow();
    [String(i + 1).padStart(2, '0'), r.nama, String(r.qty), rp_(r.harga), rp_(r.subtotal)]
      .forEach(t => baris.appendTableCell(t));
  });

  doc.saveAndClose();
  const pdfBlob = DriveApp.getFileById(salinan.getId()).getAs(MimeType.PDF).setName(nomor + '.pdf');
  const pdfFile = folder.createFile(pdfBlob);
  salinan.setTrashed(true);
  return pdfFile;
}

function buatTemplateNota_(folder) {
  const doc = DocumentApp.create('Templat Nota — JanSae (jangan dihapus)');
  const body = doc.getBody();
  body.clear();
  body.appendParagraph('{{LOGO}}');
  body.appendParagraph('{{NAMA_USAHA}}').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('{{SLOGAN}}');
  body.appendParagraph('{{ALAMAT_USAHA}}');
  body.appendParagraph('{{KONTAK}}');
  body.appendParagraph('NOTA / RECEIPT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('No. Nota: {{NO_NOTA}}     Tanggal: {{TANGGAL}}     Status: {{STATUS}}');
  body.appendParagraph('Kepada: {{PELANGGAN}}');
  body.appendParagraph('Alamat: {{ALAMAT_PELANGGAN}}');
  body.appendTable([['NO', 'NAMA BARANG / JASA', 'QTY', 'HARGA', 'TOTAL']]);
  body.appendParagraph('Subtotal: {{SUBTOTAL}}');
  body.appendParagraph('Diskon: {{DISKON}}');
  body.appendParagraph('Pajak: {{PAJAK}}');
  body.appendParagraph('TOTAL: {{TOTAL}}').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph('{{TERBILANG}}');
  body.appendParagraph('Catatan: {{CATATAN}}');
  body.appendParagraph('Hormat kami, {{TTD_NAMA}}');
  doc.saveAndClose();
  const f = DriveApp.getFileById(doc.getId());
  folder.addFile(f);
  DriveApp.getRootFolder().removeFile(f);
  return doc.getId();
}

function notaPdf_(d) {
  const n = cariNota_(d.id);
  if (!n) return fail_('Nota tidak ditemukan.', 404);
  if (!n.file_id) return fail_('PDF belum tersedia untuk nota ini.', 404);
  const f = DriveApp.getFileById(n.file_id);
  return ok_({ nama: f.getName(), mime: 'application/pdf',
    dataBase64: Utilities.base64Encode(f.getBlob().getBytes()) });
}

function notaHapus_(d, sesi) {
  const t = tabel_(SHEET.nota);
  const n = objek_(t).find(x => String(x.id) === String(d.id));
  if (!n) return fail_('Nota tidak ditemukan.', 404);
  t.sh.deleteRow(n._row);
  tulisDetail_(n.id, []);
  if (n.file_id) hapusFileAman_(n.file_id);
  auditTulis_(sesi && sesi.email, 'NOTA_HAPUS', n.nomor);
  return ok_({}, 'Nota ' + n.nomor + ' dihapus.');
}

function notaKirimEmail_(d, sesi) {
  const t = tabel_(SHEET.nota);
  const n = objek_(t).find(x => String(x.id) === String(d.id));
  if (!n) return fail_('Nota tidak ditemukan.', 404);
  if (!n.file_id) return fail_('PDF belum tersedia untuk nota ini.', 404);

  const pel = objek_(tabel_(SHEET.pelanggan)).find(p => String(p.id) === String(n.pelanggan_id)) || {};
  const to = String(d.email || pel.email || '').trim();
  if (!to) return fail_('Pelanggan belum punya alamat email.');
  if (MailApp.getRemainingDailyQuota() < 1) {
    return fail_('Kuota email harian habis (reset 00:00 WIB). Nota tetap bisa diunduh.', 429);
  }

  const s = bacaPengaturan_();
  const pdf = DriveApp.getFileById(n.file_id).getBlob().setName(n.nomor + '.pdf');
  try {
    MailApp.sendEmail({
      to: to,
      subject: 'Nota ' + n.nomor + ' — ' + s.nama_usaha,
      body: 'Yth. ' + (pel.nama || n.pelanggan_nama) + ',\n\nTerlampir nota ' + n.nomor +
        ' dari ' + s.nama_usaha + '.\n\nTerima kasih atas kepercayaan Anda.',
      name: s.nama_usaha,
      attachments: [pdf]
    });
    setKolom_(t, n._row, 'status_email', 'Terkirim');
    auditTulis_(sesi && sesi.email, 'EMAIL_TERKIRIM', n.nomor + ' → ' + to);
    return ok_({ statusEmail: 'Terkirim' }, 'Nota terkirim ke ' + to + '.');
  } catch (err) {
    setKolom_(t, n._row, 'status_email', 'Gagal');
    auditTulis_(sesi && sesi.email, 'EMAIL_GAGAL', n.nomor);
    return fail_('Gagal mengirim email: ' + err.message);
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function dashboardGet_() {
  const key = 'dash_' + ver_('nota');
  let res = cacheGet_(key);
  if (!res) {
    const bulan = tglStr_(new Date()).slice(0, 7);
    const notas = objek_(tabel_(SHEET.nota)).map(n => Object.assign({}, n, { tanggal: tglStr_(n.tanggal) }));
    const ini = notas.filter(n => String(n.tanggal).slice(0, 7) === bulan);
    res = {
      bulan: bulan,
      jumlahNota: ini.length,
      totalPenjualan: ini.reduce((a, n) => a + Number(n.total), 0),
      notaLunas: ini.filter(n => n.status_lunas === 'LUNAS').length,
      terbaru: notas.sort((a, b) => Number(b.dibuat) - Number(a.dibuat)).slice(0, 5).map(ringkasNota_)
    };
    cachePut_(key, res, 300);
  }
  // Kuota selalu segar, tidak dicache
  return ok_(Object.assign({}, res, {
    kuotaSisa: MailApp.getRemainingDailyQuota(), kuotaMaks: KUOTA_EMAIL_MAKS
  }));
}

// ============================================================
// SETUP — jalankan dari editor, boleh diulang (idempoten)
// ============================================================
function setupAppEnvironment() {
  const p = PROPS.getProperties();
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();

  const root = p.ROOT_FOLDER_ID ? DriveApp.getFolderById(p.ROOT_FOLDER_ID) : DriveApp.createFolder('JanSae Nota Maker');
  const logoF = p.LOGO_FOLDER_ID ? DriveApp.getFolderById(p.LOGO_FOLDER_ID) : root.createFolder('Logo');
  const pdfF = p.PDF_FOLDER_ID ? DriveApp.getFolderById(p.PDF_FOLDER_ID) : root.createFolder('Nota PDF');

  let ss = p.SPREADSHEET_ID ? SpreadsheetApp.openById(p.SPREADSHEET_ID) : null;
  if (!ss) {
    ss = SpreadsheetApp.create('Database — JanSae Nota Maker');
    DriveApp.getFileById(ss.getId()).moveTo(root);
  }

  Object.keys(HEADER).forEach(name => {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADER[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADER[name].length).setFontWeight('bold');
    }
  });
  const kosong = ss.getSheetByName('Sheet1');
  if (kosong && ss.getSheets().length > 1 && kosong.getLastRow() === 0) ss.deleteSheet(kosong);

  // Nomor telepon harus tersimpan sebagai teks agar angka 0 di depan tidak hilang
  ss.getSheetByName(SHEET.pelanggan).getRange('D:D').setNumberFormat('@');
  ss.getSheetByName(SHEET.pengaturan).getRange('B:B').setNumberFormat('@');

  // Seed pengaturan default hanya untuk kunci yang belum ada
  const sPeng = ss.getSheetByName(SHEET.pengaturan);
  const adaKunci = sPeng.getLastRow() > 1
    ? sPeng.getRange(2, 1, sPeng.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const seed = Object.keys(PENGATURAN_DEFAULT).filter(k => adaKunci.indexOf(k) === -1)
    .map(k => [k, PENGATURAN_DEFAULT[k]]);
  if (seed.length) sPeng.getRange(sPeng.getLastRow() + 1, 1, seed.length, 2).setValues(seed);

  // Pemilik aplikasi sebagai admin pertama
  const sUser = ss.getSheetByName(SHEET.pengguna);
  const adaEmail = sUser.getLastRow() > 1
    ? sUser.getRange(2, 1, sUser.getLastRow() - 1, 1).getValues().map(r => String(r[0]).toLowerCase()) : [];
  if (owner && adaEmail.indexOf(owner) === -1) sUser.appendRow([owner, 'Pemilik', 'admin', true]);

  const templateId = p.TEMPLATE_DOC_ID || buatTemplateNota_(root);

  const baru = {
    SPREADSHEET_ID: ss.getId(), ROOT_FOLDER_ID: root.getId(),
    LOGO_FOLDER_ID: logoF.getId(), PDF_FOLDER_ID: pdfF.getId(), TEMPLATE_DOC_ID: templateId
  };
  if (!p.SESSION_SECRET) baru.SESSION_SECRET = acak_(64);
  setProps_(baru);

  // Catatan baca-saja untuk admin (bukan sumber kebenaran)
  const cfg = ss.getSheetByName(SHEET.config);
  if (cfg.getLastRow() <= 1) {
    cfg.getRange(2, 1, 4, 3).setValues([
      ['SPREADSHEET_ID', ss.getId(), 'ID database (Script Properties)'],
      ['ROOT_FOLDER_ID', root.getId(), 'Folder utama Drive'],
      ['TEMPLATE_DOC_ID', templateId, 'Templat nota Google Docs'],
      ['APP_VERSION', APP_VERSION, 'Versi backend']
    ]);
  }

  Logger.log('✅ Setup selesai.');
  Logger.log('   Spreadsheet : ' + ss.getUrl());
  Logger.log('   Folder Drive: ' + root.getUrl());
  Logger.log('   Pemilik     : ' + (owner || '(tidak terbaca, tambahkan admin di sheet Pengguna)'));
  if (!prop_('GOOGLE_CLIENT_ID')) {
    Logger.log('⚠️ GOOGLE_CLIENT_ID belum diisi. Tambahkan di Script Properties sebelum login.');
  }
}
