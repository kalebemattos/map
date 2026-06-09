/**
 * tenant.js — Configuração por implantação
 *
 * ⚠️  Edite AMBAS as variáveis ao fazer deploy para um novo tenant.
 *
 * TENANT_ID      → slug de texto usado na tabela tenant_config (ex: 'betao', 'pirai')
 * TENANT_NUM_ID  → id numérico da tabela usuarios (ex: 1, 2, 3...)
 *
 * Exemplos:
 *   Tenant padrão:   TENANT_ID = 'default',  TENANT_NUM_ID = 1
 *   Campanha Betão:  TENANT_ID = 'betao',    TENANT_NUM_ID = 2
 *   Piraí:           TENANT_ID = 'pirai',    TENANT_NUM_ID = 3  (ajuste conforme o banco)
 */
window.TENANT_ID     = 'default';
window.TENANT_NUM_ID = 1;          // tenant_id numérico na tabela usuarios

// ─────────────────────────────────────────────────────────────────────────────
// INTERCEPTOR GLOBAL DE FETCH — renovação automática de token em qualquer página
//
// Captura o fetch nativo ANTES de qualquer outro script para que todas as
// requisições da aplicação passem por aqui, incluindo páginas que não importam
// auth.js. Se uma resposta vier com 401, tenta renovar o accessToken usando o
// refreshToken e refaz a requisição original de forma transparente.
// ─────────────────────────────────────────────────────────────────────────────
;(function() {
  // Guarda referência ao fetch nativo (sem interceptação) para uso interno
  const _nativeFetch = window.fetch.bind(window);
  window._nativeFetch = _nativeFetch; // exposto para auth.js reutilizar

  // Serializa chamadas simultâneas de refresh (evita corrida)
  let _refreshInFlight = null;

  async function _doRefresh() {
    if (_refreshInFlight) return _refreshInFlight;

    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;

    const apiUrl = window.API_URL || 'https://map-backend-j88s.onrender.com/api';

    _refreshInFlight = (async () => {
      try {
        const res = await _nativeFetch(`${apiUrl}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt })
        });
        // 401/403 = refresh token inválido ou expirado — deve deslogar
        if (res.status === 401 || res.status === 403) return false;
        // Outro erro (5xx, rede) — não sabemos; conservador: não desloga
        if (!res.ok) return 'network_error';

        const data = await res.json();
        if (!data.accessToken) return false;

        localStorage.setItem('token', data.accessToken);
        return true;
      } catch {
        return 'network_error';
      } finally {
        _refreshInFlight = null;
      }
    })();

    return _refreshInFlight;
  }

  // Só instala o override uma vez (evita dupla interceptação se tenant.js
  // for carregado em múltiplos contextos ou auth.js já tiver instalado)
  if (window._fetchInterceptorInstalled) return;
  window._fetchInterceptorInstalled = true;

  // Expõe _doRefresh globalmente para que auth.js possa reutilizá-lo
  window._doRefresh = _doRefresh;

  window.fetch = async function(url, options = {}) {
    // Não intercepta endpoints de autenticação (evita loops)
    const urlStr = (typeof url === 'string') ? url : (url?.url || '');
    if (/\/(login|refresh|logout|validar-token)(\?|$)/.test(urlStr)) {
      return _nativeFetch(url, options);
    }

    const res = await _nativeFetch(url, options);
    if (res.status !== 401) return res;

    // Recebeu 401 — tenta renovar o token
    const resultado = await _doRefresh();

    if (resultado === true) {
      // Renovou — reexecuta a requisição com o novo token
      const newOpts = {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
        }
      };
      return _nativeFetch(url, newOpts);
    }

    if (resultado === false) {
      // Refresh expirado — redireciona para login
      // (auth.js faz o logout completo se estiver carregado; senão, recarrega)
      if (typeof logout === 'function') {
        logout();
      } else {
        localStorage.clear();
        location.reload();
      }
    }

    // 'network_error' — retorna o 401 original sem deslogar
    return res;
  };
})();
