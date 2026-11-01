// ============================================================
// LAPISAN API — semua komunikasi ke GAS lewat fetch()
// POST wajib Content-Type text/plain agar tidak memicu preflight CORS.
// ============================================================
const Api = (() => {
  const TOKEN_KEY = 'jansae_token';

  function konfigOk() {
    const url = (window.APP_CONFIG && window.APP_CONFIG.GAS_URL) || '';
    return url && !/GANTI|XXXX/.test(url);
  }

  async function get(action) {
    if (!konfigOk()) {
      return { success: false, message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js.' };
    }
    try {
      const r = await fetch(window.APP_CONFIG.GAS_URL + '?action=' + encodeURIComponent(action));
      return await r.json();
    } catch (err) {
      return { success: false, message: 'Tidak bisa terhubung ke server.' };
    }
  }

  async function post(action, data) {
    if (!konfigOk()) {
      return { success: false, message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js.' };
    }
    try {
      const r = await fetch(window.APP_CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: getToken(), data: data || {} })
      });
      return await r.json();
    } catch (err) {
      return { success: false, message: 'Tidak bisa terhubung ke server. Periksa koneksi internet.' };
    }
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  return { get: get, post: post, getToken: getToken, setToken: setToken, clearToken: clearToken };
})();
