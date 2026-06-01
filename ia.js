// ═══════════════════════════════════════════════════════════════════════════
// IA.JS  —  Assistente Gemini  •  Mapa do Estado do RJ
//
// Funcionalidades:
//   1. Chat flutuante — perguntas livres sobre a campanha
//   2. Análise de cidade — ao clicar "Analisar", gera resumo estratégico
//   3. Relatório geral  — gera relatório completo da campanha
// ═══════════════════════════════════════════════════════════════════════════

window.IACampanha = (function () {
  'use strict'

  // ── Configuração ────────────────────────────────────────────────────────
  const ENDPOINT = `${window.API_URL}/ia/chat`

  // ── Estado interno ──────────────────────────────────────────────────────
  let _chatAberto   = false
  let _historico    = []   // { role: 'user'|'ia', texto }
  let _cidadeAtual  = null

  // ── Helpers de dados ────────────────────────────────────────────────────
  function _candidatos() {
    return (window.configSistema && window.configSistema.candidatos) || []
  }

  function _contextoBase() {
    const cands = _candidatos()
    const nomes = cands.map(c => c.nome).join(' e ')
    const totalCidades = Object.keys(window.dataCache || {}).length
    let totalLideres = 0
    let metaTotal    = 0

    Object.values(window.dataCache || {}).forEach(c => {
      totalLideres += (c.liderancas || []).length
      Object.values(c.expectativaCidade || {}).forEach(v => { metaTotal += Number(v || 0) })
    })

    return `Você é um assistente estratégico de campanha eleitoral do estado do Rio de Janeiro.
A campanha é de: ${nomes || 'candidatos não informados'}.
Total de municípios monitorados: ${totalCidades}.
Total de líderes cadastrados: ${totalLideres.toLocaleString('pt-BR')}.
Meta total de votos: ${metaTotal.toLocaleString('pt-BR')}.
Responda de forma objetiva, prática e em português brasileiro.
Nunca invente dados — use apenas o contexto fornecido.`
  }

  function _contextoMunicipio(nome) {
    const cache  = (window.getDataCache && window.getDataCache(nome)) || {}
    const votos  = (window.votosValidos && window.votosValidos[nome]) || 0
    const liders = cache.liderancas || []
    const cands  = _candidatos()

    const metasLinhas = cands.map(c => {
      const meta = Number(cache.expectativaCidade?.[c.chave] || 0)
      return `  - ${c.nome}: ${meta.toLocaleString('pt-BR')} votos de meta`
    }).join('\n')

    const lidResumo = liders.slice(0, 10).map(l =>
      `    • ${l.nome} (${l.vinculo_politico || 'ambos'}) — ${Number(l.expectativa_votos || 0).toLocaleString('pt-BR')} votos esperados`
    ).join('\n')

    return `${_contextoBase()}

Município em análise: ${nome}
Votos válidos (eleição anterior): ${votos.toLocaleString('pt-BR')}
Número de líderes cadastrados: ${liders.length}
Metas por candidato:
${metasLinhas || '  (sem metas cadastradas)'}
${liders.length ? `Primeiros líderes:\n${lidResumo}` : ''}`
  }

  function _contextoRelatorio() {
    const cands = _candidatos()
    const cache = window.dataCache || {}
    const votos = window.votosValidos || {}

    // Top 10 cidades por meta
    const ranking = Object.keys(cache)
      .map(nome => {
        const meta = Object.values(cache[nome]?.expectativaCidade || {}).reduce((s, v) => s + Number(v || 0), 0)
        return { nome, meta, liders: (cache[nome]?.liderancas || []).length, votos: votos[nome] || 0 }
      })
      .sort((a, b) => b.meta - a.meta)
      .slice(0, 15)

    const rankingTexto = ranking.map((c, i) =>
      `  ${i + 1}. ${c.nome}: meta=${c.meta.toLocaleString('pt-BR')}, líderes=${c.liders}, votos=${c.votos.toLocaleString('pt-BR')}`
    ).join('\n')

    const totalMeta    = ranking.reduce((s, c) => s + c.meta, 0) + 0 // simplificado
    const totalLideres = Object.values(cache).reduce((s, c) => s + (c.liderancas || []).length, 0)

    const metasPorCand = cands.map(c => {
      const t = Object.values(cache).reduce((s, city) =>
        s + Number(city.expectativaCidade?.[c.chave] || 0), 0)
      return `  ${c.nome}: ${t.toLocaleString('pt-BR')} votos`
    }).join('\n')

    return `${_contextoBase()}

DADOS COMPLETOS PARA RELATÓRIO:
Total de líderes no estado: ${totalLideres.toLocaleString('pt-BR')}
Metas por candidato (total estado):
${metasPorCand}
Top 15 municípios por meta:
${rankingTexto}

Gere um relatório estratégico detalhado com:
1. Panorama geral da campanha
2. Pontos fortes (cidades com maior cobertura)
3. Pontos de atenção (cidades com meta alta mas poucos líderes)
4. Recomendações estratégicas
5. Próximos passos sugeridos
Use formatação com seções claras. Seja objetivo e prático.`
  }

  // ── Chamada à API ────────────────────────────────────────────────────────
  async function _chamarIA(mensagem, contexto) {
    const token = localStorage.getItem('token')
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ mensagem, contexto })
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro na IA')
    return data.resposta || ''
  }

  // ── Render de mensagem (suporte a markdown básico) ───────────────────────
  function _renderTexto(texto) {
    return texto
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3}\s(.+)$/gm, '<strong style="font-size:13px;">$1</strong>')
      .replace(/^[-•]\s(.+)$/gm, '<span style="display:block;padding-left:12px;">• $1</span>')
      .replace(/\n/g, '<br>')
  }

  // ── UI: Chat Panel ───────────────────────────────────────────────────────
  function _criarChat() {
    // Botão flutuante
    const fab = document.createElement('button')
    fab.id = 'ia-fab'
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:22px;height:22px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="none"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8 9h8M8 12h6M8 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span>IA</span>`
    fab.style.cssText = `
      position:fixed; bottom:24px; right:24px; z-index:3000;
      background:linear-gradient(135deg,#4f46e5,#7c3aed);
      color:#fff; border:none; border-radius:50px; padding:10px 18px;
      display:flex; align-items:center; gap:8px; font-family:'DM Sans',sans-serif;
      font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 20px rgba(79,70,229,.5);
      transition:transform .2s,box-shadow .2s;`
    fab.onmouseenter = () => { fab.style.transform = 'translateY(-2px)'; fab.style.boxShadow = '0 6px 28px rgba(79,70,229,.65)' }
    fab.onmouseleave = () => { fab.style.transform = ''; fab.style.boxShadow = '0 4px 20px rgba(79,70,229,.5)' }
    fab.onclick = toggleChat
    document.body.appendChild(fab)

    // Painel de chat
    const painel = document.createElement('div')
    painel.id = 'ia-painel'
    painel.innerHTML = `
      <div id="ia-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="1.5"/><path d="M8 9h8M8 12h6M8 15h4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px;">Assistente de Campanha</div>
            <div style="font-size:11px;opacity:.7;">Powered by Gemini</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="ia-btn-relatorio" title="Gerar relatório completo" style="background:rgba(255,255,255,.15);border:none;border-radius:8px;color:#fff;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">📊 Relatório</button>
          <button onclick="window.IACampanha.fechar()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;padding:0 4px;opacity:.7;">✕</button>
        </div>
      </div>
      <div id="ia-msgs"></div>
      <div id="ia-input-area">
        <textarea id="ia-input" placeholder="Pergunte sobre a campanha…" rows="2"></textarea>
        <button id="ia-send">
          <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px;"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`
    painel.style.cssText = `
      position:fixed; bottom:80px; right:24px; z-index:3000;
      width:380px; max-height:560px; background:#fff; border-radius:20px;
      box-shadow:0 12px 48px rgba(0,0,0,.22); display:none; flex-direction:column;
      font-family:'DM Sans',sans-serif; overflow:hidden;`
    document.body.appendChild(painel)

    // Estilos internos
    const st = document.createElement('style')
    st.textContent = `
      #ia-header { background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
      #ia-msgs { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; max-height:360px; }
      .ia-msg { max-width:88%; padding:10px 14px; border-radius:14px; font-size:13px; line-height:1.55; }
      .ia-msg.user { background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff; align-self:flex-end; border-bottom-right-radius:4px; }
      .ia-msg.ia   { background:#f1f5f9; color:#1e293b; align-self:flex-start; border-bottom-left-radius:4px; }
      .ia-msg.erro { background:#fee2e2; color:#b91c1c; }
      .ia-digitando { display:flex; gap:5px; padding:12px 16px; align-items:center; }
      .ia-dot { width:7px; height:7px; background:#94a3b8; border-radius:50%; animation:ia-bounce .9s infinite; }
      .ia-dot:nth-child(2) { animation-delay:.2s; }
      .ia-dot:nth-child(3) { animation-delay:.4s; }
      @keyframes ia-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-8px)} }
      #ia-input-area { display:flex; gap:8px; padding:12px; border-top:1px solid #e2e8f0; align-items:flex-end; }
      #ia-input { flex:1; border:1px solid #e2e8f0; border-radius:12px; padding:9px 12px; font-family:inherit; font-size:13px; resize:none; outline:none; color:#1e293b; transition:border-color .2s; }
      #ia-input:focus { border-color:#4f46e5; }
      #ia-send { background:linear-gradient(135deg,#4f46e5,#7c3aed); border:none; border-radius:10px; color:#fff; width:36px; height:36px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:opacity .2s; }
      #ia-send:hover { opacity:.85; }
      #ia-btn-relatorio:hover { background:rgba(255,255,255,.25) !important; }
    `
    document.head.appendChild(st)

    // Eventos
    document.getElementById('ia-send').onclick = _enviarMensagem
    document.getElementById('ia-input').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _enviarMensagem() }
    }
    document.getElementById('ia-btn-relatorio').onclick = gerarRelatorio

    // Boas-vindas
    _adicionarMensagem('ia', 'Olá! Sou seu assistente de campanha. Posso analisar municípios, gerar relatórios e responder perguntas sobre os dados. Como posso ajudar?')
  }

  function _adicionarMensagem(role, texto) {
    const msgs = document.getElementById('ia-msgs')
    if (!msgs) return
    const div = document.createElement('div')
    div.className = `ia-msg ${role}`
    div.innerHTML = role === 'ia' ? _renderTexto(texto) : texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    msgs.appendChild(div)
    msgs.scrollTop = msgs.scrollHeight
    _historico.push({ role, texto })
    return div
  }

  function _mostrarDigitando() {
    const msgs = document.getElementById('ia-msgs')
    if (!msgs) return null
    const div = document.createElement('div')
    div.className = 'ia-msg ia ia-digitando'
    div.innerHTML = '<div class="ia-dot"></div><div class="ia-dot"></div><div class="ia-dot"></div>'
    msgs.appendChild(div)
    msgs.scrollTop = msgs.scrollHeight
    return div
  }

  async function _enviarMensagem() {
    const input = document.getElementById('ia-input')
    if (!input) return
    const texto = input.value.trim()
    if (!texto) return
    input.value = ''
    input.disabled = true

    _adicionarMensagem('user', texto)
    const typing = _mostrarDigitando()

    try {
      const contexto = _cidadeAtual
        ? _contextoMunicipio(_cidadeAtual)
        : _contextoBase()
      const resp = await _chamarIA(texto, contexto)
      if (typing) typing.remove()
      _adicionarMensagem('ia', resp)
    } catch (e) {
      if (typing) typing.remove()
      _adicionarMensagem('ia erro', '⚠️ ' + e.message)
    } finally {
      input.disabled = false
      input.focus()
    }
  }

  // ── API pública ─────────────────────────────────────────────────────────
  function toggleChat() {
    _chatAberto = !_chatAberto
    const painel = document.getElementById('ia-painel')
    if (painel) painel.style.display = _chatAberto ? 'flex' : 'none'
  }

  function fechar() {
    _chatAberto = false
    const painel = document.getElementById('ia-painel')
    if (painel) painel.style.display = 'none'
  }

  async function analisarCidade(nome) {
    _cidadeAtual = nome
    // Abre chat se fechado
    if (!_chatAberto) toggleChat()

    const btn = document.getElementById('ia-analisar-btn')
    if (btn) { btn.disabled = true; btn.textContent = 'Analisando…' }

    _adicionarMensagem('user', `Analise estrategicamente o município de ${nome}`)
    const typing = _mostrarDigitando()

    try {
      const resp = await _chamarIA(
        `Faça uma análise estratégica completa do município de ${nome} com base nos dados fornecidos. Inclua: situação atual, pontos de atenção e recomendações.`,
        _contextoMunicipio(nome)
      )
      if (typing) typing.remove()
      _adicionarMensagem('ia', resp)
    } catch (e) {
      if (typing) typing.remove()
      _adicionarMensagem('ia erro', '⚠️ ' + e.message)
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 Analisar com IA' }
    }
  }

  async function gerarRelatorio() {
    if (!_chatAberto) toggleChat()
    _adicionarMensagem('user', 'Gere um relatório estratégico completo da campanha no estado')
    const typing = _mostrarDigitando()

    const btn = document.getElementById('ia-btn-relatorio')
    if (btn) { btn.disabled = true }

    try {
      const resp = await _chamarIA('', _contextoRelatorio())
      if (typing) typing.remove()
      _adicionarMensagem('ia', resp)
    } catch (e) {
      if (typing) typing.remove()
      _adicionarMensagem('ia erro', '⚠️ ' + e.message)
    } finally {
      if (btn) { btn.disabled = false }
    }
  }

  function setCidadeAtual(nome) {
    _cidadeAtual = nome
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _criarChat()
    console.log('[IACampanha] Pronto')
  }

  return { init, toggleChat, fechar, analisarCidade, gerarRelatorio, setCidadeAtual }
})()
