window.API_URL = 'https://map-backend-j88s.onrender.com/api';

// ─────────────────────────────────────────────
// FETCH NATIVO — sem interceptação
// Usa a referência salva pelo tenant.js (que carrega primeiro) ou captura aqui.
// Usado internamente para evitar loops infinitos no interceptor.
// ─────────────────────────────────────────────
const _rawFetch = window._nativeFetch || window.fetch.bind(window);

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

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────
async function logout() {
  const refreshToken = getRefreshToken();

  // Invalida o refresh token no servidor antes de limpar localmente
  if (refreshToken) {
    try {
      await _rawFetch(`${window.API_URL}/logout`, {
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
// Delega ao _doRefresh do tenant.js (que já serializa chamadas e usa _nativeFetch).
// Caso tenant.js não esteja carregado, implementa localmente.
// Retorna: true (ok), false (token inválido → deve deslogar), 'network_error'
// ─────────────────────────────────────────────
async function tentarRefresh() {
  // Reutiliza o _doRefresh instalado pelo tenant.js se disponível
  if (typeof window._doRefresh === 'function') {
    return window._doRefresh();
  }

  // Fallback para páginas sem tenant.js
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await _rawFetch(`${window.API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (res.status === 403 || res.status === 401) return false;
    if (!res.ok) return 'network_error';

    const data = await res.json();
    if (!data.accessToken) return false;

    localStorage.setItem('token', data.accessToken);
    return true;
  } catch {
    return 'network_error';
  }
}

// ─────────────────────────────────────────────
// RENOVAÇÃO AUTOMÁTICA (a cada 13 minutos)
// Access token dura 15min — renova proativamente antes de expirar
// ─────────────────────────────────────────────
let _refreshInterval = null;

function iniciarRenovacaoAutomatica() {
  if (_refreshInterval) clearInterval(_refreshInterval);
  _refreshInterval = setInterval(async () => {
    const resultado = await tentarRefresh();
    if (resultado === false) {
      // Refresh inválido — desloga
      clearInterval(_refreshInterval);
      logout();
    }
    // 'network_error' ou true: continua tentando no próximo intervalo
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

  // Inicializa IA (apenas se disponível nesta página)
  if (window.IACampanha && typeof window.IACampanha.init === 'function') {
    window.IACampanha.init()
  }
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

    const usuario = document.getElementById('login-user').value.trim().toLowerCase();
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
      // Inclui tenantId numérico para o backend filtrar pelo tenant correto.
      // window.TENANT_NUM_ID é definido em tenant.js (1 = padrão, 2 = betão, etc.).
      const tenantId = (typeof window.TENANT_NUM_ID !== 'undefined' &&
                        window.TENANT_NUM_ID != null &&
                        window.TENANT_NUM_ID > 1)
        ? window.TENANT_NUM_ID
        : undefined;

      const res = await _rawFetch(`${window.API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha, ...(tenantId != null ? { tenantId } : {}) })
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
    // Sem token local — tenta refresh antes de pedir login
    const refreshOk = await tentarRefresh();
    if (refreshOk === true) {
      iniciarRenovacaoAutomatica();
      liberarInterface();
      if (typeof window.iniciarAplicacao === 'function') {
        await window.iniciarAplicacao();
      }
    } else {
      iniciarLogin();
    }
    return;
  }

  try {
    const res = await _rawFetch(`${window.API_URL}/validar-token`, {
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

    // Token expirado — tenta refresh
    if (res.status === 401) {
      const resultado = await tentarRefresh();
      if (resultado === true) {
        iniciarRenovacaoAutomatica();
        liberarInterface();
        if (typeof window.iniciarAplicacao === 'function') {
          await window.iniciarAplicacao();
        }
        return;
      }
      if (resultado === 'network_error') {
        // Rede instável — não desloga, tenta liberar com o token que tem
        iniciarRenovacaoAutomatica();
        liberarInterface();
        if (typeof window.iniciarAplicacao === 'function') {
          await window.iniciarAplicacao();
        }
        return;
      }
    }

    // Refresh falhou definitivamente — pede login
    localStorage.clear();
    iniciarLogin();

  } catch {
    // Erro de rede no validar-token — não desloga, tenta offline
    const resultado = await tentarRefresh();
    if (resultado !== false) {
      // 'network_error' ou true: continua sem deslogar
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

// ─────────────────────────────────────────────
// PAGESHOW — restauração via bfcache (botão voltar/avançar do browser)
// DOMContentLoaded NÃO dispara no bfcache — este handler cobre esse caso.
// ─────────────────────────────────────────────
window.addEventListener('pageshow', async function (e) {
  // e.persisted = true apenas quando a página vem do bfcache
  if (!e.persisted) return;

  // 1. Revalida o token silenciosamente (pode ter expirado enquanto estava em outra aba)
  const token = getToken();
  if (!token) {
    const resultado = await tentarRefresh();
    if (resultado === false) { localStorage.clear(); location.reload(); return; }
  }

  // 2. Força o Leaflet a recalcular o tamanho do container
  //    (os tiles ficam cinza/deslocados se não chamar isto após bfcache)
  if (window.map && typeof window.map.invalidateSize === 'function') {
    setTimeout(() => {
      window.map.invalidateSize(false);
    }, 100);
  }

  // 3. Re-injeta o indicador de campanha se o seletor estiver vazio
  const seletor = document.getElementById('seletor-campanha');
  if (seletor && !seletor.children.length) {
    if (typeof carregarConfig === 'function') {
      await carregarConfig();
    }
  }
});
