// ═══════════════════════════════════════════════════════════════════════════
// IA.JS  —  Alice · Assistente de Campanha  •  Mapa do Estado do RJ
// ═══════════════════════════════════════════════════════════════════════════

window.IACampanha = (function () {
  'use strict'

  const ENDPOINT = `${window.API_URL}/ia/chat`

  let _chatAberto  = false
  let _historico   = []
  let _cidadeAtual = null

  // ── Helpers de dados ─────────────────────────────────────────────────────
  function _candidatos() {
    return (window.configSistema && window.configSistema.candidatos) || []
  }

  function _contextoBase() {
    const cands = _candidatos()
    const nomes = cands.map(c => c.nome).join(' e ')
    const cache = window.dataCache    || {}
    const votos = window.votosValidos || {}
    let totalLideres = 0, metaTotal = 0

    Object.values(cache).forEach(c => {
      totalLideres += (c.liderancas || []).length
      Object.values(c.expectativaCidade || {}).forEach(v => { metaTotal += Number(v || 0) })
    })

    const tabelaVotos = Object.entries(votos)
      .sort((a, b) => b[1] - a[1])
      .map(([mun, v]) => {
        const c    = cache[mun] || {}
        const lids = (c.liderancas || []).length
        const meta = Object.values(c.expectativaCidade || {}).reduce((s, x) => s + Number(x || 0), 0)
        return `  ${mun}: votos=${v.toLocaleString('pt-BR')}, líderes=${lids}, meta=${meta.toLocaleString('pt-BR')}`
      }).join('\n')

    return `Você é Alice, assistente estratégica de campanha eleitoral do estado do Rio de Janeiro.
A campanha é de: ${nomes || 'candidatos não informados'}.
Total de municípios: ${Object.keys(votos).length}.
Total de líderes cadastrados: ${totalLideres.toLocaleString('pt-BR')}.
Meta total de votos: ${metaTotal.toLocaleString('pt-BR')}.

DADOS POR MUNICÍPIO (votos válidos eleição anterior, líderes cadastrados, meta):
${tabelaVotos || '(dados ainda carregando)'}

Responda de forma objetiva, prática e em português brasileiro. Nunca invente dados.`
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
Metas por candidato:\n${metasLinhas || '  (sem metas cadastradas)'}
${liders.length ? `Primeiros líderes:\n${lidResumo}` : ''}`
  }

  function _contextoRelatorio() {
    const cands = _candidatos()
    const cache = window.dataCache || {}
    const votos = window.votosValidos || {}

    const ranking = Object.keys(cache)
      .map(nome => {
        const meta = Object.values(cache[nome]?.expectativaCidade || {}).reduce((s, v) => s + Number(v || 0), 0)
        return { nome, meta, liders: (cache[nome]?.liderancas || []).length, votos: votos[nome] || 0 }
      })
      .sort((a, b) => b.meta - a.meta).slice(0, 15)

    const rankingTexto = ranking.map((c, i) =>
      `  ${i + 1}. ${c.nome}: meta=${c.meta.toLocaleString('pt-BR')}, líderes=${c.liders}, votos=${c.votos.toLocaleString('pt-BR')}`
    ).join('\n')

    const totalLideres = Object.values(cache).reduce((s, c) => s + (c.liderancas || []).length, 0)
    const metasPorCand = cands.map(c => {
      const t = Object.values(cache).reduce((s, city) =>
        s + Number(city.expectativaCidade?.[c.chave] || 0), 0)
      return `  ${c.nome}: ${t.toLocaleString('pt-BR')} votos`
    }).join('\n')

    return `${_contextoBase()}

DADOS COMPLETOS PARA RELATÓRIO:
Total de líderes no estado: ${totalLideres.toLocaleString('pt-BR')}
Metas por candidato (total estado):\n${metasPorCand}
Top 15 municípios por meta:\n${rankingTexto}

Gere um relatório estratégico detalhado com: panorama geral, pontos fortes, pontos de atenção e recomendações. Use seções claras e seja objetivo.`
  }

  // ── Chamada à API ────────────────────────────────────────────────────────
  async function _chamarIA(mensagem, contexto) {
    const token = localStorage.getItem('token')
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ mensagem, contexto })
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Erro na IA')
    return data.resposta || ''
  }

  function _renderTexto(texto) {
    return texto
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^#{1,3}\s(.+)$/gm, '<strong style="font-size:13px;display:block;margin-top:6px;">$1</strong>')
      .replace(/^[-•]\s(.+)$/gm, '<span style="display:block;padding-left:10px;margin-top:2px;">· $1</span>')
      .replace(/\n/g, '<br>')
  }

  // ── Injetar CSS uma única vez ─────────────────────────────────────────────
  function _injetarCSS() {
    if (document.getElementById('ia-styles')) return
    const st = document.createElement('style')
    st.id = 'ia-styles'
    st.textContent = `
      /* ── Cluster de botões flutuantes ── */
      #ia-cluster {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3100;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
      }

      /* ── Chip de cidade (aparece quando cidade selecionada) ── */
      #ia-cidade-chip {
        display: none;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(139, 92, 246, 0.35);
        border-radius: 50px;
        padding: 8px 16px 8px 12px;
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,.3), 0 0 0 1px rgba(139,92,246,.12);
        transition: transform .2s, box-shadow .2s, border-color .2s;
        animation: ia-slide-up .25s cubic-bezier(.34,1.56,.64,1) both;
        white-space: nowrap;
        max-width: 240px;
      }
      #ia-cidade-chip:hover {
        transform: translateY(-2px);
        border-color: rgba(139, 92, 246, 0.6);
        box-shadow: 0 6px 28px rgba(0,0,0,.35), 0 0 0 1px rgba(139,92,246,.25);
      }
      #ia-cidade-chip .chip-icon {
        width: 22px; height: 22px; border-radius: 50%;
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        font-size: 11px;
      }
      #ia-cidade-chip .chip-label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #ia-cidade-chip .chip-cta {
        color: #a78bfa;
        font-size: 10px;
        font-weight: 500;
        margin-left: 2px;
        flex-shrink: 0;
      }

      /* ── Linha inferior: FAB + botão relatório ── */
      #ia-row-bottom {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* ── Botão relatório (pequeno, discreto) ── */
      #ia-btn-rel {
        width: 38px; height: 38px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 50%;
        color: #94a3b8;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform .2s, color .2s, border-color .2s, box-shadow .2s;
        box-shadow: 0 2px 10px rgba(0,0,0,.2);
      }
      #ia-btn-rel:hover {
        transform: translateY(-2px);
        color: #c4b5fd;
        border-color: rgba(139,92,246,.4);
        box-shadow: 0 4px 18px rgba(0,0,0,.3);
      }
      #ia-btn-rel svg { width: 16px; height: 16px; }

      /* ── FAB principal "Alice" ── */
      #ia-fab {
        display: flex;
        align-items: center;
        gap: 9px;
        background: linear-gradient(135deg, #6d28d9 0%, #4f46e5 60%, #3730a3 100%);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 50px;
        padding: 0 18px 0 12px;
        height: 44px;
        color: #fff;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: .01em;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(109,40,217,.5), 0 1px 0 rgba(255,255,255,.1) inset;
        transition: transform .2s, box-shadow .2s;
        position: relative;
        overflow: hidden;
      }
      #ia-fab::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255,255,255,.12) 0%, transparent 60%);
        pointer-events: none;
      }
      #ia-fab:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(109,40,217,.65), 0 1px 0 rgba(255,255,255,.1) inset;
      }
      #ia-fab:active { transform: translateY(0); }
      #ia-fab .fab-avatar {
        width: 26px; height: 26px; border-radius: 50%;
        background: rgba(255,255,255,.15);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        font-size: 13px;
      }
      /* Pulso sutil no FAB quando inativo */
      #ia-fab.pulsing::after {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: 50px;
        border: 2px solid rgba(109,40,217,.5);
        animation: ia-pulse-ring 2.5s ease-in-out infinite;
        pointer-events: none;
      }
      @keyframes ia-pulse-ring {
        0%   { transform: scale(1); opacity: .7; }
        60%  { transform: scale(1.05); opacity: 0; }
        100% { transform: scale(1); opacity: 0; }
      }

      /* ── Painel de chat ── */
      #ia-painel {
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3100;
        width: 390px;
        max-height: 580px;
        background: #0f172a;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 22px;
        box-shadow: 0 24px 64px rgba(0,0,0,.55), 0 0 0 1px rgba(109,40,217,.15);
        display: none;
        flex-direction: column;
        font-family: 'DM Sans', 'Inter', system-ui, sans-serif;
        overflow: hidden;
        animation: ia-painel-in .3s cubic-bezier(.34,1.56,.64,1) both;
      }
      @keyframes ia-painel-in {
        from { opacity: 0; transform: scale(.95) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes ia-slide-up {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Header do painel */
      #ia-painel-header {
        background: linear-gradient(135deg, #1e1b4b 0%, #1e1035 100%);
        border-bottom: 1px solid rgba(255,255,255,.06);
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      #ia-painel-header .hdr-left {
        display: flex; align-items: center; gap: 11px;
      }
      #ia-painel-header .hdr-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 16px rgba(124,58,237,.5);
        font-size: 16px;
        flex-shrink: 0;
      }
      #ia-painel-header .hdr-name {
        font-size: 14px; font-weight: 700; color: #e2e8f0;
        letter-spacing: -.01em;
      }
      #ia-painel-header .hdr-sub {
        font-size: 10px; color: rgba(148,163,184,.6); margin-top: 1px;
        display: flex; align-items: center; gap: 5px;
      }
      #ia-painel-header .hdr-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #10b981;
        box-shadow: 0 0 6px #10b981; animation: ia-blink 2s ease-in-out infinite;
      }
      @keyframes ia-blink { 0%,100%{opacity:1} 50%{opacity:.4} }
      #ia-painel-header .hdr-actions {
        display: flex; gap: 6px; align-items: center;
      }
      #ia-painel-header .hdr-btn-rel {
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 8px;
        color: rgba(196,181,253,.8);
        padding: 5px 10px;
        font-size: 11px; font-weight: 600; cursor: pointer;
        font-family: inherit;
        display: flex; align-items: center; gap: 5px;
        transition: background .15s, color .15s;
      }
      #ia-painel-header .hdr-btn-rel:hover {
        background: rgba(139,92,246,.2); color: #c4b5fd;
      }
      #ia-painel-header .hdr-btn-rel svg { width: 12px; height: 12px; }
      #ia-painel-header .hdr-close {
        width: 28px; height: 28px; border-radius: 8px;
        background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
        color: rgba(148,163,184,.7); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .15s, color .15s;
      }
      #ia-painel-header .hdr-close:hover {
        background: rgba(239,68,68,.15); color: #f87171;
      }

      /* Mensagens */
      #ia-msgs {
        flex: 1;
        overflow-y: auto;
        padding: 18px 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-height: 380px;
        scroll-behavior: smooth;
      }
      #ia-msgs::-webkit-scrollbar { width: 4px; }
      #ia-msgs::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
      #ia-msgs::-webkit-scrollbar-track { background: transparent; }

      .ia-msg-wrap {
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }
      .ia-msg-wrap.user { flex-direction: row-reverse; }

      .ia-msg-avatar {
        width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px;
      }
      .ia-msg-avatar.ia-av {
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        box-shadow: 0 0 10px rgba(124,58,237,.3);
      }
      .ia-msg-avatar.user-av {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        color: rgba(148,163,184,.8);
      }

      .ia-msg {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.6;
        word-break: break-word;
      }
      .ia-msg.ia {
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.07);
        color: #cbd5e1;
        border-bottom-left-radius: 4px;
      }
      .ia-msg.user {
        background: linear-gradient(135deg, #5b21b6, #4338ca);
        color: #e9d5ff;
        border-bottom-right-radius: 4px;
        box-shadow: 0 2px 12px rgba(91,33,182,.35);
      }
      .ia-msg.erro {
        background: rgba(239,68,68,.1);
        border: 1px solid rgba(239,68,68,.2);
        color: #fca5a5;
      }

      /* Digitando */
      .ia-digitando {
        display: flex;
        gap: 5px;
        align-items: center;
        padding: 12px 14px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        width: fit-content;
      }
      .ia-dot {
        width: 6px; height: 6px; background: #6d28d9; border-radius: 50%;
        animation: ia-bounce .9s infinite;
      }
      .ia-dot:nth-child(2) { animation-delay: .18s; }
      .ia-dot:nth-child(3) { animation-delay: .36s; }
      @keyframes ia-bounce {
        0%,60%,100% { transform: translateY(0); opacity: .5; }
        30%          { transform: translateY(-7px); opacity: 1; }
      }

      /* Input */
      #ia-input-area {
        display: flex;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid rgba(255,255,255,.06);
        background: rgba(0,0,0,.2);
        align-items: flex-end;
        flex-shrink: 0;
      }
      #ia-input {
        flex: 1;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 12px;
        padding: 9px 13px;
        font-family: inherit;
        font-size: 13px;
        color: #e2e8f0;
        resize: none;
        outline: none;
        transition: border-color .2s;
        max-height: 90px;
      }
      #ia-input::placeholder { color: rgba(148,163,184,.35); }
      #ia-input:focus { border-color: rgba(139,92,246,.5); }
      #ia-send {
        width: 36px; height: 36px; flex-shrink: 0;
        background: linear-gradient(135deg, #7c3aed, #4f46e5);
        border: none; border-radius: 10px; color: #fff;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: opacity .2s, transform .15s;
        box-shadow: 0 2px 10px rgba(124,58,237,.4);
      }
      #ia-send:hover { opacity: .85; transform: scale(1.05); }
      #ia-send svg { width: 15px; height: 15px; }
    `
    document.head.appendChild(st)
  }

  // ── Criar UI ──────────────────────────────────────────────────────────────
  function _criarChat() {
    _injetarCSS()

    // ── Cluster ──
    const cluster = document.createElement('div')
    cluster.id = 'ia-cluster'

    // ── Chip de cidade ──
    const chip = document.createElement('div')
    chip.id = 'ia-cidade-chip'
    chip.innerHTML = `
      <div class="chip-icon">✦</div>
      <span class="chip-label" id="ia-chip-nome">Cidade</span>
      <span class="chip-cta">Analisar →</span>
    `
    chip.onclick = () => _cidadeAtual && analisarCidade(_cidadeAtual)

    // ── Linha inferior: relatório + FAB ──
    const row = document.createElement('div')
    row.id = 'ia-row-bottom'

    // Botão relatório
    const btnRel = document.createElement('button')
    btnRel.id = 'ia-btn-rel'
    btnRel.title = 'Gerar relatório estratégico'
    btnRel.innerHTML = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`
    btnRel.onclick = gerarRelatorio

    // FAB Alice
    const fab = document.createElement('button')
    fab.id = 'ia-fab'
    fab.className = 'pulsing'
    fab.title = 'Falar com Alice — IA de Campanha'
    fab.innerHTML = `
      <div class="fab-avatar">✦</div>
      <span>Alice</span>
    `
    fab.onclick = toggleChat

    row.appendChild(btnRel)
    row.appendChild(fab)

    cluster.appendChild(chip)
    cluster.appendChild(row)
    document.body.appendChild(cluster)

    // ── Painel de chat ──
    const painel = document.createElement('div')
    painel.id = 'ia-painel'
    painel.innerHTML = `
      <div id="ia-painel-header">
        <div class="hdr-left">
          <div class="hdr-avatar">✦</div>
          <div>
            <div class="hdr-name">Alice</div>
            <div class="hdr-sub">
              <span class="hdr-dot"></span>
              Assistente de campanha · online
            </div>
          </div>
        </div>
        <div class="hdr-actions">
          <button class="hdr-btn-rel" id="ia-painel-btn-rel" title="Gerar relatório completo">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Relatório
          </button>
          <button class="hdr-close" id="ia-fechar" title="Fechar">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div id="ia-msgs"></div>
      <div id="ia-input-area">
        <textarea id="ia-input" placeholder="Pergunte sobre a campanha…" rows="1"></textarea>
        <button id="ia-send">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
        </button>
      </div>
    `
    document.body.appendChild(painel)

    // Eventos
    document.getElementById('ia-fechar').onclick = fechar
    document.getElementById('ia-send').onclick = _enviarMensagem
    document.getElementById('ia-painel-btn-rel').onclick = gerarRelatorio
    document.getElementById('ia-input').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _enviarMensagem() }
    }

    // Mensagem de boas-vindas
    _adicionarMensagem('ia', 'Olá! Sou Alice, sua assistente de campanha. Clique em um município no mapa para analisá-lo, ou me pergunte qualquer coisa sobre os dados. 👋')
  }

  // ── Mensagens ──────────────────────────────────────────────────────────────
  function _adicionarMensagem(role, texto) {
    const msgs = document.getElementById('ia-msgs')
    if (!msgs) return
    const isIA = role === 'ia' || role === 'ia erro'

    const wrap = document.createElement('div')
    wrap.className = `ia-msg-wrap ${isIA ? 'ia' : 'user'}`

    const avatar = document.createElement('div')
    avatar.className = `ia-msg-avatar ${isIA ? 'ia-av' : 'user-av'}`
    avatar.textContent = isIA ? '✦' : '👤'

    const bubble = document.createElement('div')
    bubble.className = `ia-msg ${isIA ? (role === 'ia erro' ? 'erro' : 'ia') : 'user'}`
    bubble.innerHTML = isIA
      ? _renderTexto(texto)
      : texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    wrap.appendChild(avatar)
    wrap.appendChild(bubble)
    msgs.appendChild(wrap)
    msgs.scrollTop = msgs.scrollHeight
    _historico.push({ role, texto })
    return wrap
  }

  function _mostrarDigitando() {
    const msgs = document.getElementById('ia-msgs')
    if (!msgs) return null
    const wrap = document.createElement('div')
    wrap.className = 'ia-msg-wrap ia'
    const av = document.createElement('div')
    av.className = 'ia-msg-avatar ia-av'
    av.textContent = '✦'
    const dig = document.createElement('div')
    dig.className = 'ia-digitando'
    dig.innerHTML = '<div class="ia-dot"></div><div class="ia-dot"></div><div class="ia-dot"></div>'
    wrap.appendChild(av)
    wrap.appendChild(dig)
    msgs.appendChild(wrap)
    msgs.scrollTop = msgs.scrollHeight
    return wrap
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
      const ctx  = _cidadeAtual ? _contextoMunicipio(_cidadeAtual) : _contextoBase()
      const resp = await _chamarIA(texto, ctx)
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

  // ── API pública ───────────────────────────────────────────────────────────
  function toggleChat() {
    _chatAberto = !_chatAberto
    const painel = document.getElementById('ia-painel')
    const fab    = document.getElementById('ia-fab')
    if (painel) painel.style.display = _chatAberto ? 'flex' : 'none'
    if (fab)    fab.classList.toggle('pulsing', !_chatAberto)
  }

  function fechar() {
    _chatAberto = false
    const painel = document.getElementById('ia-painel')
    const fab    = document.getElementById('ia-fab')
    if (painel) painel.style.display = 'none'
    if (fab)    fab.classList.add('pulsing')
  }

  async function analisarCidade(nome) {
    _cidadeAtual = nome
    if (!_chatAberto) toggleChat()

    _adicionarMensagem('user', `Analise estrategicamente o município de ${nome}`)
    const typing = _mostrarDigitando()
    try {
      const resp = await _chamarIA(
        `Faça uma análise estratégica completa do município de ${nome} com base nos dados fornecidos.`,
        _contextoMunicipio(nome)
      )
      if (typing) typing.remove()
      _adicionarMensagem('ia', resp)
    } catch (e) {
      if (typing) typing.remove()
      _adicionarMensagem('ia erro', '⚠️ ' + e.message)
    }
  }

  async function gerarRelatorio() {
    if (!_chatAberto) toggleChat()
    _adicionarMensagem('user', 'Gere um relatório estratégico completo da campanha no estado')
    const typing = _mostrarDigitando()
    const btn = document.getElementById('ia-painel-btn-rel')
    if (btn) btn.disabled = true
    try {
      const resp = await _chamarIA('', _contextoRelatorio())
      if (typing) typing.remove()
      _adicionarMensagem('ia', resp)
    } catch (e) {
      if (typing) typing.remove()
      _adicionarMensagem('ia erro', '⚠️ ' + e.message)
    } finally {
      if (btn) btn.disabled = false
    }
  }

  function setCidadeAtual(nome) {
    _cidadeAtual = nome
    const chip     = document.getElementById('ia-cidade-chip')
    const chipNome = document.getElementById('ia-chip-nome')
    if (!chip) return
    if (nome) {
      const label = nome.length > 22 ? nome.slice(0, 20) + '…' : nome
      if (chipNome) chipNome.textContent = label
      chip.style.display = 'flex'
      // Força re-animação
      chip.style.animation = 'none'
      requestAnimationFrame(() => { chip.style.animation = '' })
    } else {
      chip.style.display = 'none'
    }
  }

  function init() {
    _criarChat()
    // Remove botão inline do sidebar caso exista de versão anterior
    const old = document.getElementById('ia-analisar-btn')
    if (old) old.remove()
    console.log('[Alice] Pronta ✦')
  }

  return { init, toggleChat, fechar, analisarCidade, gerarRelatorio, setCidadeAtual }
})()
