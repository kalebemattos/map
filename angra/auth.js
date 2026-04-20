window.API_URL = 'https://map-backend-j88s.onrender.com/api';

// ─────────────────────────────────────────────
// TOKEN HELPERS
// ─────────────────────────────────────────────
function getToken()        { return localStorage.getItem('token'); }
function getRefreshToken() { return localStorage.getItem('refreshToken'); }

async function tentarRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${window.API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.accessToken) return false;
    localStorage.setItem('token', data.accessToken);
    return true;
  } catch {
    return false;
  }
}

let _refreshInterval = null;
function iniciarRenovacaoAutomatica() {
  if (_refreshInterval) clearInterval(_refreshInterval);
  _refreshInterval = setInterval(async () => {
    const ok = await tentarRefresh();
    if (!ok) { clearInterval(_refreshInterval); logout(); }
  }, 13 * 60 * 1000);
}

function liberarInterface() {
  const loginModal = document.getElementById('login-modal');
  const blocker    = document.getElementById('blocker');
  const content    = document.getElementById('content-wrapper');
  if (loginModal) loginModal.style.display = 'none';
  if (blocker)    blocker.style.display    = 'none';
  if (content)    content.style.display    = 'block';
}

async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${window.API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
    } catch {}
  }
  if (_refreshInterval) clearInterval(_refreshInterval);
  localStorage.clear();
  location.reload();
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
function iniciarLogin() {
  const btn   = document.getElementById('login-btn');
  const error = document.getElementById('login-error');
  const passInput = document.getElementById('login-pass');
  if (passInput) {
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  }

  btn.onclick = async () => {
    error.style.display = 'none';
    const usuario = document.getElementById('login-user').value.trim();
    const senha   = document.getElementById('login-pass').value;
    if (!usuario || !senha) {
      error.textContent = 'Preencha usuário e senha';
      error.style.display = 'block';
      return;
    }
    btn.textContent = 'Entrando...';
    btn.disabled = true;
    try {
      const res = await fetch(`${window.API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '');
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') await window.iniciarAplicacao();
    } catch {
      error.textContent = 'Usuário ou senha inválidos';
      error.style.display = 'block';
    } finally {
      btn.textContent = 'Entrar';
      btn.disabled = false;
    }
  };
}

// ─────────────────────────────────────────────
// BOOT — verificar sessão existente
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();

  if (!token) {
    document.getElementById('blocker').style.display  = 'none';
    document.getElementById('login-modal').style.display = 'flex';
    iniciarLogin();
    return;
  }

  try {
    const res = await fetch(`${window.API_URL}/validar-token`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.ok) {
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') await window.iniciarAplicacao();
      return;
    }

    if (res.status === 401) {
      const refreshOk = await tentarRefresh();
      if (refreshOk) {
        iniciarRenovacaoAutomatica();
        liberarInterface();
        if (typeof window.iniciarAplicacao === 'function') await window.iniciarAplicacao();
        return;
      }
    }

    localStorage.clear();
    document.getElementById('blocker').style.display  = 'none';
    document.getElementById('login-modal').style.display = 'flex';
    iniciarLogin();

  } catch {
    const refreshOk = await tentarRefresh();
    if (refreshOk) {
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') await window.iniciarAplicacao();
    } else {
      localStorage.clear();
      document.getElementById('blocker').style.display  = 'none';
      document.getElementById('login-modal').style.display = 'flex';
      iniciarLogin();
    }
  }
});

// ─────────────────────────────────────────────
// PAGESHOW — restauração via bfcache
// ─────────────────────────────────────────────
window.addEventListener('pageshow', async function (e) {
  if (!e.persisted) return;

  const token = getToken();
  if (!token) {
    const refreshOk = await tentarRefresh();
    if (!refreshOk) { localStorage.clear(); location.reload(); return; }
  }

  if (window.map && typeof window.map.invalidateSize === 'function') {
    setTimeout(() => window.map.invalidateSize(false), 100);
  }
});
