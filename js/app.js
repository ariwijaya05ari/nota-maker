// ============================================================
// NOTA MAKER — logika aplikasi (vanilla JS, tanpa framework)
// ============================================================
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const JUDUL = { beranda: 'Beranda', buat: 'Buat Nota', daftar: 'Daftar Nota',
  detail: 'Detail Nota', pengaturan: 'Pengaturan' };
const MAKS_LOGO = 1024 * 1024;

const State = {
  me: null, pelanggan: [], editId: null, tanggal: null,
  items: [], notas: [], total: 0, page: 1, detail: null
};

const $ = (sel) => document.querySelector(sel);

// ---------- Utilitas ----------
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function rp(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
function fmtTgl(s) {
  const p = String(s || '').split('-').map(Number);
  return p.length === 3 && p[2] ? p[2] + ' ' + BULAN[p[1] - 1] + ' ' + p[0] : '-';
}
function todayISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function waitFor(cond, ms) {
  return new Promise(res => {
    const t0 = Date.now();
    (function cek() {
      if (cond()) return res(true);
      if (Date.now() - t0 > ms) return res(false);
      setTimeout(cek, 150);
    })();
  });
}
function toast(msg, type) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3200);
}
function showLoading(on) { $('#loading').classList.toggle('hidden', !on); }
function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Panggilan API terpadu: loading, toast, dan penanganan sesi habis.
async function call(action, data) {
  showLoading(true);
  const r = await Api.post(action, data);
  showLoading(false);
  if (!r.success) {
    if (r.code === 401) { logout(true); toast('Sesi berakhir. Silakan masuk lagi.', 'error'); }
    else toast(r.message || 'Terjadi kesalahan.', 'error');
    return null;
  }
  return r;
}

// ---------- Login ----------
async function initLogin() {
  showView('login');
  $('#login-msg').textContent = '';
  const cfg = await Api.get('auth.config');
  if (!cfg.success) { $('#login-msg').textContent = cfg.message; return; }
  if (!cfg.data.googleClientId) {
    $('#login-msg').textContent = 'Client ID Google belum diatur oleh pemilik aplikasi.';
    return;
  }
  const siap = await waitFor(() => window.google && google.accounts && google.accounts.id, 8000);
  if (!siap) { $('#login-msg').textContent = 'Layanan login Google gagal dimuat. Muat ulang halaman.'; return; }
  google.accounts.id.initialize({ client_id: cfg.data.googleClientId, callback: onCredential, auto_select: false });
  google.accounts.id.renderButton($('#gsi-btn'), {
    theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280, locale: 'id'
  });
}

async function onCredential(resp) {
  const r = await call('auth.login', { credential: resp.credential });
  if (!r) return;
  Api.setToken(r.data.token);
  localStorage.setItem('jansae_me', JSON.stringify(r.data.me));
  State.me = r.data.me;
  boot();
}

function logout(silent) {
  Api.clearToken();
  localStorage.removeItem('jansae_me');
  State.me = null;
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();
  if (!silent) toast('Anda sudah keluar.');
  initLogin();
}

function boot() {
  $('#app-shell').classList.remove('hidden');
  $('#view-login').classList.add('hidden');
  loadPelanggan();
  route();
}

// ---------- Routing (hash) ----------
function showView(name) {
  const isLogin = name === 'login';
  $('#view-login').classList.toggle('hidden', !isLogin);
  $('#app-shell').classList.toggle('hidden', isLogin);
}

function route() {
  if (!State.me) return initLogin();
  const [nama, arg] = (location.hash || '#beranda').slice(1).split('/');
  const v = JUDUL[nama] ? nama : 'beranda';
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('hidden', el.id !== 'view-' + v));
  document.querySelectorAll('[data-nav]').forEach(a => {
    const aktif = a.dataset.nav === v || (v === 'detail' && a.dataset.nav === 'daftar');
    a.classList.toggle('active', aktif);
    if (aktif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#page-title').textContent = v === 'buat' && arg ? 'Ubah Nota' : JUDUL[v];
  window.scrollTo(0, 0);

  if (v === 'beranda') loadBeranda();
  if (v === 'buat') openBuat(arg);
  if (v === 'daftar') loadDaftar(true);
  if (v === 'detail') loadDetail(arg);
  if (v === 'pengaturan') loadPengaturan();
}

// ---------- Beranda ----------
async function loadBeranda() {
  $('#beranda-body').innerHTML = '<div class="skeleton"></div><div class="skeleton" style="margin-top:12px"></div>';
  const r = await call('dashboard.get', {});
  if (!r) return;
  const d = r.data;
  const terpakai = Math.max(0, d.kuotaMaks - d.kuotaSisa);
  const pct = d.kuotaMaks ? Math.min(100, Math.round(terpakai / d.kuotaMaks * 100)) : 0;
  const terbaru = d.terbaru.length
    ? d.terbaru.map(n => `
        <a class="nota-card" href="#detail/${esc(n.id)}">
          <div class="top"><span class="no">${esc(n.nomor)}</span>
            <span class="badge ${n.statusLunas === 'LUNAS' ? 'solid' : ''}">${esc(n.statusLunas)}</span></div>
          <div class="name">${esc(n.pelangganNama)}</div>
          <div class="meta"><span>${fmtTgl(n.tanggal)}</span><span class="amount">${rp(n.total)}</span></div>
        </a>`).join('')
    : `<div class="empty">Belum ada nota.<br><a href="#buat" class="btn btn-primary btn-sm" style="margin-top:12px">Buat nota pertama</a></div>`;

  $('#beranda-body').innerHTML = `
    <a href="#buat" class="btn btn-primary btn-block" style="margin-bottom:16px">+ Buat Nota Baru</a>
    <div class="metrics">
      <div class="metric"><div class="label">Nota bulan ini</div>
        <div class="value">${d.jumlahNota}</div>
        <div class="delta">${d.notaLunas} lunas</div></div>
      <div class="metric"><div class="label">Total penjualan</div>
        <div class="value" style="font-size:18px">${rp(d.totalPenjualan)}</div>
        <div class="delta">bulan ${esc(d.bulan)}</div></div>
      <div class="metric wide"><div class="label">Kuota email hari ini</div>
        <div class="value" style="font-size:18px">${terpakai} / ${d.kuotaMaks} terpakai</div>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        <div class="delta">Sisa ${d.kuotaSisa}. Reset otomatis pukul 00:00 WIB.</div></div>
    </div>
    <h3 class="section-title">Nota terbaru</h3>
    <div class="list">${terbaru}</div>`;
}

// ---------- Pelanggan (untuk saran isian) ----------
async function loadPelanggan() {
  const r = await Api.post('pelanggan.list', {});
  if (!r.success) return;
  State.pelanggan = r.data.items || [];
  $('#dl-pelanggan').innerHTML = State.pelanggan
    .map(p => `<option value="${esc(p.nama)}"></option>`).join('');
}
function isiDariPelanggan() {
  const nama = $('#f-nama').value.trim().toLowerCase();
  const p = State.pelanggan.find(x => String(x.nama).toLowerCase() === nama);
  if (!p) return;
  if (!$('#f-telepon').value) $('#f-telepon').value = p.telepon || '';
  if (!$('#f-email').value) $('#f-email').value = p.email || '';
  if (!$('#f-alamat').value) $('#f-alamat').value = p.alamat || '';
}

// ---------- Buat / ubah nota ----------
function resetForm() {
  $('#form-nota').reset();
  $('#f-diskon').value = 0;
  $('#f-pajak').value = 0;
  $('#f-status').value = 'LUNAS';
  State.tanggal = null;
  State.items = [{ nama: '', qty: 1, harga: 0 }];
  $('#form-msg').textContent = '';
  renderItems();
}

async function openBuat(id) {
  State.editId = id || null;
  if (!id) return resetForm();
  const r = await call('nota.get', { id: id });
  if (!r) return location.hash = '#daftar';
  const d = r.data;
  resetForm();
  State.tanggal = d.tanggal;
  $('#f-nama').value = d.pelanggan.nama || '';
  $('#f-telepon').value = d.pelanggan.telepon || '';
  $('#f-email').value = d.pelanggan.email || '';
  $('#f-alamat').value = d.pelanggan.alamat || '';
  $('#f-diskon').value = d.diskonPersen || 0;
  $('#f-pajak').value = d.pajakPersen || 0;
  $('#f-status').value = d.statusLunas === 'BELUM LUNAS' ? 'BELUM LUNAS' : 'LUNAS';
  $('#f-catatan').value = d.catatan || '';
  State.items = d.items.map(it => ({ nama: it.nama, qty: it.qty, harga: it.harga }));
  renderItems();
}

function renderItems() {
  $('#f-items').innerHTML = State.items.map((it, i) => `
    <div class="item" data-i="${i}">
      <div class="item-head">
        <input data-k="nama" placeholder="Nama barang / jasa" value="${esc(it.nama)}" aria-label="Nama barang baris ${i + 1}">
        <button type="button" class="icon-btn" data-act="hapus" aria-label="Hapus baris ${i + 1}"
          ${State.items.length === 1 ? 'disabled' : ''}>✕</button>
      </div>
      <div class="item-grid">
        <input data-k="qty" type="number" min="1" step="1" inputmode="numeric" value="${esc(it.qty)}" aria-label="Qty baris ${i + 1}">
        <input data-k="harga" type="number" min="0" step="500" inputmode="numeric" value="${esc(it.harga)}" aria-label="Harga satuan baris ${i + 1}">
        <div class="calc" data-sub>${rp((Number(it.qty) || 0) * (Number(it.harga) || 0))}</div>
      </div>
    </div>`).join('');
  updateTotals();
}

function updateTotals() {
  const sub = State.items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.harga) || 0), 0);
  const dp = Math.min(100, Math.max(0, Number($('#f-diskon').value) || 0));
  const pp = Math.min(100, Math.max(0, Number($('#f-pajak').value) || 0));
  const dn = Math.round(sub * dp / 100), base = sub - dn, pn = Math.round(base * pp / 100);
  $('#p-sub').textContent = rp(sub);
  $('#p-diskon').textContent = '- ' + rp(dn);
  $('#p-pajak').textContent = rp(pn);
  $('#p-total').textContent = rp(base + pn);
}

function kumpulkanNota() {
  return {
    id: State.editId || undefined,
    tanggal: State.tanggal || todayISO(),
    pelanggan: {
      nama: $('#f-nama').value.trim(),
      telepon: $('#f-telepon').value.trim(),
      email: $('#f-email').value.trim(),
      alamat: $('#f-alamat').value.trim()
    },
    items: State.items.map(it => ({ nama: String(it.nama || '').trim(), qty: Number(it.qty), harga: Number(it.harga) })),
    diskonPersen: Number($('#f-diskon').value) || 0,
    pajakPersen: Number($('#f-pajak').value) || 0,
    statusLunas: $('#f-status').value,
    catatan: $('#f-catatan').value.trim()
  };
}

function validasiNota(d) {
  if (!d.pelanggan.nama) return 'Nama pelanggan wajib diisi.';
  if (!d.items.length) return 'Minimal satu barang atau jasa.';
  for (let i = 0; i < d.items.length; i++) {
    const it = d.items[i];
    if (!it.nama) return 'Baris ' + (i + 1) + ': nama barang atau jasa wajib diisi.';
    if (!(it.qty > 0)) return 'Baris ' + (i + 1) + ': qty harus angka positif.';
    if (!(it.harga >= 0)) return 'Baris ' + (i + 1) + ': harga tidak boleh negatif.';
  }
  return '';
}

async function saveNota(e) {
  e.preventDefault();
  const d = kumpulkanNota();
  const galat = validasiNota(d);
  $('#form-msg').textContent = galat;
  if (galat) return;
  const r = await call('nota.simpan', d);
  if (!r) return;
  toast(r.message || 'Nota tersimpan.');
  State.editId = null;
  location.hash = '#detail/' + r.data.id;
}

// ---------- Daftar nota ----------
async function loadDaftar(reset) {
  if (reset) { State.page = 1; State.notas = []; }
  const r = await call('nota.list', {
    q: $('#q').value.trim(),
    status: $('#f-status-nota').value,
    dari: $('#f-dari').value,
    sampai: $('#f-sampai').value,
    page: State.page
  });
  if (!r) return;
  State.total = r.data.total;
  State.notas = reset ? r.data.items : State.notas.concat(r.data.items);
  renderDaftar();
}

function renderDaftar() {
  const list = $('#list-nota');
  list.innerHTML = State.notas.length
    ? State.notas.map(n => `
        <a class="nota-card" href="#detail/${esc(n.id)}">
          <div class="top"><span class="no">${esc(n.nomor)}</span>
            <span>
              <span class="badge ${n.statusLunas === 'LUNAS' ? 'solid' : ''}">${esc(n.statusLunas)}</span>
              ${n.statusEmail === 'Gagal' ? '<span class="badge crit">Gagal kirim</span>' : ''}
            </span></div>
          <div class="name">${esc(n.pelangganNama)}</div>
          <div class="meta"><span>${fmtTgl(n.tanggal)} · ${esc(n.statusEmail)}</span><span class="amount">${rp(n.total)}</span></div>
        </a>`).join('')
    : '<div class="empty">Tidak ada nota yang cocok dengan filter.</div>';
  $('#list-info').textContent = 'Menampilkan ' + State.notas.length + ' dari ' + State.total + ' nota';
  $('#btn-more').classList.toggle('hidden', State.notas.length >= State.total);
}

// ---------- Detail nota ----------
async function loadDetail(id) {
  if (!id) return location.hash = '#daftar';
  $('#detail-body').innerHTML = '<div class="skeleton"></div>';
  const r = await call('nota.get', { id: id });
  if (!r) { $('#detail-body').innerHTML = '<div class="empty">Nota tidak ditemukan.</div>'; return; }
  const d = r.data;
  State.detail = d;
  const baris = d.items.map((it, i) => `
    <tr><td>${String(i + 1).padStart(2, '0')}</td><td>${esc(it.nama)}</td>
      <td class="num">${it.qty}</td><td class="num">${rp(it.harga)}</td><td class="num">${rp(it.subtotal)}</td></tr>`).join('');

  $('#detail-body').innerHTML = `
    <div class="card">
      <div class="detail-head">
        <div>
          <div class="no">${esc(d.nomor)}</div>
          <h2>${esc(d.pelanggan.nama)}</h2>
          <div class="muted">${fmtTgl(d.tanggal)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge ${d.statusLunas === 'LUNAS' ? 'solid' : ''}">${esc(d.statusLunas)}</span>
          <span class="badge">Email: ${esc(d.statusEmail)}</span>
        </div>
      </div>
      <dl class="kv">
        <dt>Pelanggan</dt><dd>${esc(d.pelanggan.nama)}</dd>
        <dt>Telepon</dt><dd>${esc(d.pelanggan.telepon || '-')}</dd>
        <dt>Email</dt><dd>${esc(d.pelanggan.email || '-')}</dd>
        <dt>Alamat</dt><dd>${esc(d.pelanggan.alamat || '-')}</dd>
        ${d.catatan ? `<dt>Catatan</dt><dd>${esc(d.catatan)}</dd>` : ''}
      </dl>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>No</th><th>Nama</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${baris}</tbody>
        </table>
      </div>
    </div>

    <div class="totals totals-detail">
      <div><span>Subtotal</span><span>${rp(d.subtotal)}</span></div>
      <div><span>Diskon (${d.diskonPersen}%)</span><span>- ${rp(d.diskonNilai)}</span></div>
      <div><span>Pajak (${d.pajakPersen}%)</span><span>${rp(d.pajakNilai)}</span></div>
      <div class="grand"><span>Total</span><span>${rp(d.total)}</span></div>
    </div>

    <div class="actions" data-id="${esc(d.id)}">
      <button class="btn btn-primary" data-act="pdf" type="button" ${d.punyaPdf ? '' : 'disabled'}>Unduh PDF</button>
      <button class="btn btn-secondary" data-act="cetak" type="button" ${d.punyaPdf ? '' : 'disabled'}>Cetak</button>
      <button class="btn btn-secondary wide" data-act="email" type="button">Kirim ke email pelanggan</button>
      <a class="btn btn-secondary" href="#buat/${esc(d.id)}">Ubah</a>
      <button class="btn btn-danger" data-act="hapus" type="button">Hapus</button>
    </div>`;
}

function base64ToUrl(b64, mime) { return URL.createObjectURL(base64ToBlob(b64, mime)); }

async function aksiPdf(id, mode) {
  const r = await call('nota.pdf', { id: id });
  if (!r) return;
  const url = base64ToUrl(r.data.dataBase64, r.data.mime);
  if (mode === 'unduh') {
    const a = document.createElement('a');
    a.href = url; a.download = r.data.nama;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  // Cetak: muat PDF di iframe tersembunyi lalu panggil print()
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = url;
  frame.onload = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (err) { window.open(url, '_blank'); }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
}

async function kirimEmailNota(id) {
  const r = await call('nota.kirimEmail', { id: id });
  if (r) toast(r.message || 'Email terkirim.');
  loadDetail(id);
}

async function hapusNota(id) {
  if (!confirm('Hapus nota ini? PDF-nya juga akan dihapus dari Drive.')) return;
  const r = await call('nota.hapus', { id: id });
  if (!r) return;
  toast(r.message || 'Nota dihapus.');
  location.hash = '#daftar';
}

// ---------- Pengaturan ----------
const FIELD_PENGATURAN = ['nama_usaha', 'slogan', 'alamat', 'telepon', 'email', 'instagram',
  'ttd_nama', 'prefiks', 'digit', 'catatan_default'];

async function loadPengaturan() {
  const r = await call('pengaturan.get', {});
  if (!r) return;
  FIELD_PENGATURAN.forEach(k => { $('#s-' + k).value = r.data[k] === undefined ? '' : r.data[k]; });
  $('#s-nomor_terakhir').value = r.data.nomor_terakhir || '';
  $('#logo-status').textContent = r.data.logoAda
    ? 'Logo sudah tersimpan. Unggah file baru untuk menggantinya.'
    : 'Belum ada logo. PNG atau JPG, maksimal 1 MB.';
  $('#peng-msg').textContent = '';
}

async function savePengaturan(e) {
  e.preventDefault();
  const data = {};
  FIELD_PENGATURAN.forEach(k => { data[k] = $('#s-' + k).value.trim(); });
  data.digit = Number(data.digit) || 5;
  const r = await call('pengaturan.simpan', data);
  if (r) { toast(r.message || 'Pengaturan tersimpan.'); loadPengaturan(); }
}

async function unggahLogo() {
  const file = $('#s-logo').files[0];
  if (!file) return toast('Pilih file logo terlebih dahulu.', 'error');
  if (['image/png', 'image/jpeg'].indexOf(file.type) === -1) return toast('Format logo harus PNG atau JPG.', 'error');
  if (file.size > MAKS_LOGO) return toast('Ukuran logo maksimal 1 MB.', 'error');
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('Gagal membaca file.'));
    fr.readAsDataURL(file);
  });
  const r = await call('logo.unggah', { mime: file.type, dataBase64: dataUrl.split(',')[1] });
  if (r) { toast(r.message || 'Logo tersimpan.'); $('#s-logo').value = ''; loadPengaturan(); }
}

// ---------- Ikatan kejadian ----------
function bindUi() {
  $('#btn-logout').addEventListener('click', () => logout(false));

  $('#form-nota').addEventListener('submit', saveNota);
  $('#btn-tambah-item').addEventListener('click', () => {
    State.items.push({ nama: '', qty: 1, harga: 0 });
    renderItems();
  });
  $('#f-items').addEventListener('input', (e) => {
    const row = e.target.closest('.item');
    if (!row || !e.target.dataset.k) return;
    const it = State.items[Number(row.dataset.i)];
    const k = e.target.dataset.k;
    it[k] = k === 'nama' ? e.target.value : (Number(e.target.value) || 0);
    row.querySelector('[data-sub]').textContent = rp((Number(it.qty) || 0) * (Number(it.harga) || 0));
    updateTotals();
  });
  $('#f-items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="hapus"]');
    if (!btn) return;
    const i = Number(btn.closest('.item').dataset.i);
    if (State.items.length > 1) State.items.splice(i, 1);
    renderItems();
  });
  ['#f-diskon', '#f-pajak'].forEach(s => $(s).addEventListener('input', updateTotals));
  $('#f-nama').addEventListener('change', isiDariPelanggan);
  $('#btn-batal').addEventListener('click', () => { location.hash = State.editId ? '#detail/' + State.editId : '#beranda'; });

  $('#btn-cari').addEventListener('click', () => loadDaftar(true));
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadDaftar(true); });
  $('#btn-more').addEventListener('click', () => { State.page++; loadDaftar(false); });

  $('#detail-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const id = btn.closest('[data-id]') ? btn.closest('[data-id]').dataset.id : State.detail.id;
    const act = btn.dataset.act;
    if (act === 'pdf') aksiPdf(id, 'unduh');
    if (act === 'cetak') aksiPdf(id, 'cetak');
    if (act === 'email') kirimEmailNota(id);
    if (act === 'hapus') hapusNota(id);
  });

  $('#form-pengaturan').addEventListener('submit', savePengaturan);
  $('#btn-logo').addEventListener('click', unggahLogo);
}

window.addEventListener('hashchange', route);

document.addEventListener('DOMContentLoaded', () => {
  bindUi();
  const me = localStorage.getItem('jansae_me');
  if (Api.getToken() && me) {
    try { State.me = JSON.parse(me); } catch (e) { State.me = null; }
    if (State.me) return boot();
  }
  initLogin();
});
