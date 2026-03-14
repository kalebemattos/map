window.API_URL = 'https://map-backend-j88s.onrender.com/api';

// ─────────────────────────────────────────────
// TOKEN HELPERS
// ─────────────────────────────────────────────

function getToken()        { return localStorage.getItem('token') }
function getRefreshToken() { return localStorage.getItem('refreshToken') }

function salvarTokens(accessToken, refreshToken) {
  localStorage.setItem('token', accessToken);
  // refreshToken só sobrescreve se vier novo (no login vem, no refresh não)
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

async function logout() {
  const refreshToken = getRefreshToken();

  // Invalida o refresh token no servidor antes de limpar localmente
  if (refreshToken) {
    try {
      await fetch(`${window.API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
    } catch {
      // falha silenciosa — limpa local de qualquer forma
    }
  }

  if (_refreshInterval) clearInterval(_refreshInterval);
  localStorage.clear();
  location.reload();
}

// ─────────────────────────────────────────────
// REFRESH DO ACCESS TOKEN
// Tenta renovar o accessToken usando o refreshToken.
// Retorna true se conseguiu, false se deve deslogar.
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// RENOVAÇÃO AUTOMÁTICA (a cada 13 minutos)
// Access token dura 15min — renova antes de expirar
// ─────────────────────────────────────────────
let _refreshInterval = null;

function iniciarRenovacaoAutomatica() {
  if (_refreshInterval) clearInterval(_refreshInterval);
  _refreshInterval = setInterval(async () => {
    const ok = await tentarRefresh();
    if (!ok) {
      clearInterval(_refreshInterval);
      logout();
    }
  }, 13 * 60 * 1000); // 13 minutos
}

// ─────────────────────────────────────────────
// LIBERAR INTERFACE
// ─────────────────────────────────────────────
function liberarInterface() {
  const loginModal = document.getElementById('login-modal');
  const blocker    = document.getElementById('blocker');
  const content    = document.getElementById('content-wrapper');

  if (loginModal) loginModal.style.display = 'none';
  if (blocker)    blocker.style.display    = 'none';
  if (content)    content.style.display    = 'block';
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
function iniciarLogin() {
  const btn   = document.getElementById('login-btn');
  const error = document.getElementById('login-error');
  const passInput = document.getElementById('login-pass');

  // Suporte a Enter no campo de senha
  if (passInput) {
    passInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') btn.click();
    });
  }

  btn.onclick = async () => {
    error.style.display = 'none';

    const usuario = document.getElementById('login-user').value.trim();
    // ⚠️ NÃO usar .trim() na senha — espaços podem ser parte da senha
    const senha   = document.getElementById('login-pass').value;

    if (!usuario || !senha) {
      error.textContent = 'Preencha usuário e senha';
      error.style.display = 'block';
      return;
    }

    // Limite básico de tamanho (espelha validação do backend)
    if (usuario.length > 60 || senha.length > 128) {
      error.textContent = 'Dados inválidos';
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

      salvarTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));

      iniciarRenovacaoAutomatica();
      liberarInterface();

      if (typeof window.iniciarAplicacao === 'function') {
        await window.iniciarAplicacao();
      }

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
    iniciarLogin();
    return;
  }

  try {
    const res = await fetch(`${window.API_URL}/validar-token`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.ok) {
      // Token ainda válido
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') {
        await window.iniciarAplicacao();
      }
      return;
    }

    // Token expirado — tenta refresh antes de deslogar
    if (res.status === 401) {
      const refreshOk = await tentarRefresh();
      if (refreshOk) {
        iniciarRenovacaoAutomatica();
        liberarInterface();
        if (typeof window.iniciarAplicacao === 'function') {
          await window.iniciarAplicacao();
        }
        return;
      }
    }

    // Refresh também falhou — desloga
    localStorage.clear();
    iniciarLogin();

  } catch {
    // Erro de rede — tenta refresh antes de deslogar
    const refreshOk = await tentarRefresh();
    if (refreshOk) {
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') {
        await window.iniciarAplicacao();
      }
    } else {
      localStorage.clear();
      iniciarLogin();
    }
  }
});