// =============================================================
// MAPA DE PIRAÍ — mapa.js
// Baseado no mapa de Angra dos Reis.
//
// DIFERENÇA PRINCIPAL:
//   • GeoJSON usa NM_DIST (distritos), não NM_BAIRRO (bairros)
//   • 4 distritos: Piraí, Arrozal, Monumento, Santanésia
//   • Endpoints: /expectativa-pirai, /expectativa-pirai-todas
//   • mapa='pirai' em todas as chamadas de liderança
// =============================================================

const BAIRRO_PROP = "NM_DIST"  // propriedade do GeoJSON de Piraí

// ─────────────────────────────────────────────
// VOTOS VÁLIDOS 2022 (por distrito — preencha com dados reais)
// ─────────────────────────────────────────────
const VOTOS_VALIDOS = {
  "Piraí":      0,
  "Arrozal":    0,
  "Monumento":  0,
  "Santanésia": 0
}

// Modo de visualização: 'expectativa' | 'votosValidos' | 'liderancas'
let modoVisualizacao = 'expectativa'

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let map = null

let geoBairros       = null
let bairroAtual      = null
let layerSelecionado = null
let filtroCampanha   = "ambos"

// Cache local: { "Piraí": { liderancas:[], expectativaCidade:{ [chave]: 0, ... } }, ... }
const dataCache = {}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token')

  if (!token) {
    localStorage.clear()
    location.reload()
    throw new Error('Sem token')
  }

  const isFormData = options.body instanceof FormData
  const res = await fetch(`${window.API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {})
    }
  })

  if (res.status === 401) {
    localStorage.clear()
    location.reload()
    throw new Error('Token inválido')
  }

  return res
}

// ─────────────────────────────────────────────
// CONFIG DINÂMICA (candidatos)
// ─────────────────────────────────────────────
let configSistema = { candidatos: [], cores: {}, mapas: [] }
window.configSistema = configSistema   // expõe para GeoMode (pins coloridos por candidato)

async function carregarConfig() {
  try {
    const token = localStorage.getItem('token')
    const r = await fetch(window.API_URL + '/config', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    })
    if (!r.ok) return
    configSistema = await r.json()
    window.configSistema = configSistema   // sincroniza referência global
    // Aplicar cores de identidade visual como variáveis CSS
    if (configSistema.cores) {
      const c = typeof configSistema.cores === 'string'
        ? JSON.parse(configSistema.cores)
        : configSistema.cores
      if (c.primaria)   document.documentElement.style.setProperty('--blue-main', c.primaria)
      if (c.secundaria) document.documentElement.style.setProperty('--blue-deep', c.secundaria)
      if (c.destaque)   document.documentElement.style.setProperty('--blue-mid',  c.destaque)
    }
    injetarCandidatosPirai()
  } catch (e) { console.warn('[config] não carregada:', e) }
}

function getBadge(vinculo) {
  const cand = (configSistema.candidatos || []).find(c => c.chave === vinculo)
  if (cand) return {
    cls:   'badge-cand',
    style: `background:${cand.cor_fundo};color:${cand.cor_texto};`,
    label: cand.nome.split(' ')[0]
  }
  return { cls: 'badge-ambos', style: '', label: 'Ambos' }
}

function injetarCandidatosPirai() {
  const cands = configSistema.candidatos || []
  if (!cands.length) return

  // 1. Seletor campanha
  const seletor = document.getElementById('seletor-campanha')
  if (seletor) {
    const ambosImgs = cands.map(c =>
      `<img src="../img/${c.chave}.jpg" onerror="this.style.display='none'" alt="">`
    ).join('')
    seletor.innerHTML =
      `<div class="campanha-opcao ativa" data-campanha="ambos">${ambosImgs}<span>Ambos</span></div>` +
      cands.map(c => `
        <div class="campanha-opcao" data-campanha="${c.chave}">
          <img src="../img/${c.chave}.jpg" onerror="this.style.display='none'" alt="">
          <span>${c.nome}</span>
        </div>`).join('')
    seletor.querySelectorAll('.campanha-opcao').forEach(el => {
      el.addEventListener('click', () => {
        seletor.querySelectorAll('.campanha-opcao').forEach(e => e.classList.remove('ativa'))
        el.classList.add('ativa')
        filtroCampanha = el.dataset.campanha
        const badgeEl = document.getElementById('overlay-campanha-badge')
        if (badgeEl) {
          if (filtroCampanha === 'ambos') {
            badgeEl.textContent = 'Ambos'
          } else {
            const cand = cands.find(c => c.chave === filtroCampanha)
            badgeEl.textContent = cand ? cand.nome.split(' ')[0] : filtroCampanha
          }
        }
        if (bairroAtual) renderLiderancas(bairroAtual)
        repaintMapa()
      })
    })
  }

  // 2. Inputs de expectativa por distrito
  const expContainer = document.getElementById('exp-inputs-container')
  if (expContainer) {
    expContainer.innerHTML = `<div class="exp-grid">` +
      cands.map(c => `
        <div class="exp-field">
          <span class="exp-label" style="background:${c.cor_fundo};color:${c.cor_texto};">${c.nome.split(' ')[0]}</span>
          <input id="valor-exp-${c.chave}" type="number" min="0" value="0" placeholder="0">
        </div>`).join('') +
      `</div>`
  }

  // 3. Selects de vínculo político
  const optsCands = cands.map(c => `<option value="${c.chave}">${c.nome}</option>`).join('')
  ;['lideranca-vinculo', 'edit-vinculo'].forEach(id => {
    const sel = document.getElementById(id)
    if (!sel) return
    Array.from(sel.options).filter(o => o.value !== 'ambos').forEach(o => o.remove())
    sel.insertAdjacentHTML('beforeend', optsCands)
  })

  // Repintar mapa com as cores atualizadas do config
  repaintMapa()
}

// ─────────────────────────────────────────────
// CARREGAR DADOS DO BACKEND
// ─────────────────────────────────────────────
async function carregarTudo() {
  // Lideranças
  try {
    const res  = await apiFetch('/liderancas?mapa=pirai')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(c => {
        const raw = c.bairro || c.cidade
        initCache(raw)
        getCacheEntry(raw).liderancas = c.liderancas || []
      })
    }
  } catch (e) { console.error('Erro lideranças:', e) }

  // Expectativas por distrito
  try {
    const res  = await apiFetch('/expectativa-pirai-todas')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(e => {
        const raw = e.cidade
        initCache(raw)
        getCacheEntry(raw).expectativaCidade = e.expectativas || Object.fromEntries(
          (configSistema.candidatos || []).map(c => [c.chave, 0])
        )
      })
    }
  } catch (e) { console.error('Erro expectativas:', e) }
}

// ─────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────
function normalizarChave(texto) {
  if (!texto) return ""
  return texto.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

const _cacheIndex = {}

function initCache(bairro) {
  if (!bairro) return
  const norm = normalizarChave(bairro)
  if (_cacheIndex[norm]) {
    const existing = _cacheIndex[norm]
    if (existing !== bairro && !dataCache[bairro]) {
      dataCache[bairro] = dataCache[existing]
    }
    return
  }
  if (!dataCache[bairro]) {
    dataCache[bairro] = {
      liderancas: [],
      expectativaCidade: Object.fromEntries((configSistema.candidatos || []).map(c => [c.chave, 0]))
    }
  }
  _cacheIndex[norm] = bairro
}

function getCacheEntry(bairro) {
  if (!bairro) return { liderancas: [], expectativaCidade: Object.fromEntries((configSistema.candidatos || []).map(c => [c.chave, 0])) }
  if (dataCache[bairro]) return dataCache[bairro]
  const norm = normalizarChave(bairro)
  const original = _cacheIndex[norm]
  if (original && dataCache[original]) return dataCache[original]
  initCache(bairro)
  return dataCache[bairro]
}

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
function normalizar(texto) {
  if (!texto) return ""
  return texto.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

// Em Piraí, cada feature JÁ É um distrito — retorna o próprio nome
function getDistritoDoBairro(nomeDistrito) {
  return getDistrito(nomeDistrito) // definido em distritos.js
}

// ─────────────────────────────────────────────
// CÁLCULO DE EXPECTATIVA
// ─────────────────────────────────────────────
function getTotalExpectativa(bairro) {
  const c = dataCache[bairro]
  if (!c) return 0

  let expCidade
  if (filtroCampanha === 'ambos') {
    expCidade = Object.values(c.expectativaCidade || {}).reduce((s, v) => s + Number(v || 0), 0)
  } else {
    expCidade = Number((c.expectativaCidade || {})[filtroCampanha] || 0)
  }

  const somaLiderancas = (c.liderancas || []).reduce((s, l) => {
    const v = Number(l.expectativa_votos || 0)
    if (filtroCampanha === 'ambos') return s + v
    return (l.vinculo_politico === filtroCampanha || l.vinculo_politico === 'ambos') ? s + v : s
  }, 0)

  return expCidade + somaLiderancas
}

function calcularTotalGeral() {
  let total = 0
  Object.keys(dataCache).forEach(b => { total += getTotalExpectativa(b) })
  document.getElementById("total-expectativa").textContent = total.toLocaleString("pt-BR")
}

// ─────────────────────────────────────────────
// CORES
// ─────────────────────────────────────────────

function _hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let h, s, l = (max+min)/2
  if (max === min) { h = s = 0 } else {
    const d = max-min
    s = l > 0.5 ? d/(2-max-min) : d/(max+min)
    switch(max) {
      case r: h=((g-b)/d+(g<b?6:0))/6; break
      case g: h=((b-r)/d+2)/6; break
      default: h=((r-g)/d+4)/6
    }
  }
  return [h*360, s*100, l*100]
}
function _hslToHex(h, s, l) {
  h/=360; s/=100; l/=100
  const hue2rgb = (p,q,t) => { if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p }
  let r,g,b
  if(s===0){r=g=b=l}else{const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3)}
  return '#'+[r,g,b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')
}
function _paletaMeta(hex) {
  try {
    if (!hex || hex.length < 4) throw new Error('hex inválido')
    const [h,s] = _hexToHsl(hex)
    return [
      _hslToHex(h, Math.max(s*0.15,8),  94),
      _hslToHex(h, Math.max(s*0.5, 20), 80),
      _hslToHex(h, Math.max(s*0.8, 40), 65),
      _hslToHex(h, s,                   48),
      _hslToHex(h, Math.min(s*1.1,100), 32),
      _hslToHex(h, Math.min(s*1.2,100), 18),
    ]
  } catch { return ['#e8f4ff','#fcae91','#fb6a4a','#cb181d','#a50f15','#67000d'] }
}

function corPorExpectativa(v) {
  const cand = (configSistema.candidatos||[]).find(c => c.chave === filtroCampanha)
  const base = (cand && cand.cor_mapa) ? cand.cor_mapa : '#cb181d'
  const pal  = _paletaMeta(base)
  if (v >= 5000) return pal[5]
  if (v >= 2000) return pal[4]
  if (v >= 1000) return pal[3]
  if (v >= 300)  return pal[2]
  if (v >  0)    return pal[1]
  return pal[0]
}

function corPorVotosValidos(v) {
  if (v >= 20000) return "#084594"
  if (v >= 10000) return "#2171b5"
  if (v >= 5000)  return "#4292c6"
  if (v >= 2000)  return "#6baed6"
  if (v >  0)     return "#c6dbef"
  return "#f7fbff"
}

function corPorLiderancas(v) {
  if (v >= 10) return "#005a32"
  if (v >= 5)  return "#238b45"
  if (v >= 2)  return "#41ae76"
  if (v >= 1)  return "#99d8c9"
  return "#e5f5f9"
}

function getValorModo(bairro) {
  if (modoVisualizacao === 'votosValidos') {
    const n = normalizar(bairro)
    for (const k of Object.keys(VOTOS_VALIDOS)) {
      if (normalizar(k) === n) return VOTOS_VALIDOS[k]
    }
    return 0
  }
  if (modoVisualizacao === 'liderancas') {
    return (dataCache[bairro]?.liderancas || []).length
  }
  return getTotalExpectativa(bairro)
}

function getCorModo(bairro) {
  const v = getValorModo(bairro)
  if (modoVisualizacao === 'votosValidos') return corPorVotosValidos(v)
  if (modoVisualizacao === 'liderancas')   return corPorLiderancas(v)
  return corPorExpectativa(v)
}

// ─────────────────────────────────────────────
// REPINTAR
// ─────────────────────────────────────────────
function repaintMapa() {
  if (!geoBairros) return
  // Indicadores de lideranças e totais — sempre atualizados independente do modo
  calcularTotalGeral()
  atualizarLegenda()
  // Delega ao Modo Geográfico quando ativo (sem alterar lógica estratégica)
  if (window.GeoMode && window.GeoMode.isAtivo()) { window.GeoMode.syncStyles(); return }
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    layer.setStyle({
      color:       layer === layerSelecionado ? "#0f172a" : "#1e40af",
      weight:      layer === layerSelecionado ? 3.5 : 1.2,
      fillColor:   getCorModo(b),
      fillOpacity: layer === layerSelecionado ? 0.92 : 0.72
    })
  })
}
window.repaintMapa      = repaintMapa
window.renderLiderancas = renderLiderancas

// Mantém bairroAtual sincronizado para o GeoMode consultar
Object.defineProperty(window, 'bairroAtual', {
  get: () => bairroAtual,
  set: v => { bairroAtual = v },
  configurable: true
})

// ─────────────────────────────────────────────
// FILTRAR DISTRITO
// ─────────────────────────────────────────────
function filtrarDistrito(distrito) {
  if (!geoBairros) return
  // Delega ao Modo Geográfico quando ativo
  if (window.GeoMode && window.GeoMode.isAtivo()) { window.GeoMode.filtrarGeo(distrito); return }
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    if (!distrito) {
      layer.setStyle({ color:"#1e40af", weight:1.2, fillColor:getCorModo(b), fillOpacity:0.72 })
      return
    }
    if (b === distrito) {
      layer.setStyle({ color:"#0f172a", weight:2.5, fillColor:getCorModo(b), fillOpacity:0.9 })
    } else {
      layer.setStyle({ color:"#1e40af", weight:0.5, fillColor:"#e8f4ff", fillOpacity:0.12 })
    }
  })
}

// ─────────────────────────────────────────────
// LÍDER DO DISTRITO
// ─────────────────────────────────────────────
function mostrarLiderDistrito(distrito) {
  const card  = document.getElementById("lider-distrito-card")
  const lista = document.getElementById("lista-lideres-distrito")
  if (!distrito || !distritos[distrito]) { card.style.display = "none"; return }
  const lideres = distritos[distrito].lideres || []
  card.style.display = lideres.length ? "block" : "none"
  lista.innerHTML = ""
  lideres.forEach(lider => {
    const div = document.createElement("div")
    div.className = "lider-card"
    div.innerHTML = `
      <img src="${lider.foto}" onerror="this.src='img/lideres/default.jpg'" alt="">
      <div class="lider-info"><b>${lider.nome}</b><br><span>${lider.telefone || ""}</span></div>
    `
    lista.appendChild(div)
  })
}

// ─────────────────────────────────────────────
// RENDERIZAR LIDERANÇAS (RANKING)
// ─────────────────────────────────────────────
function renderLiderancas(bairro) {
  const lista    = document.getElementById("lista-liderancas")
  const countEl  = document.getElementById("liderancas-count")
  const totaisEl = document.getElementById("liderancas-totais")
  const user     = JSON.parse(localStorage.getItem('user') || '{}')
  const isVisualizador = user.nivel === 'visualizador'

  lista.innerHTML = ""

  if (!bairro) {
    totaisEl.style.display = "none"
    countEl.textContent = "0"
    return
  }

  const c = getCacheEntry(bairro)

  ;(configSistema.candidatos || []).forEach(cand => {
    const input = document.getElementById('valor-exp-' + cand.chave)
    if (input) input.value = c.expectativaCidade?.[cand.chave] || 0
  })

  let liderancas = c.liderancas || []
  if (filtroCampanha !== "ambos") {
    liderancas = liderancas.filter(
      l => l.vinculo_politico === filtroCampanha || l.vinculo_politico === "ambos"
    )
  }

  liderancas = [...liderancas].sort((a, b) => (b.expectativa_votos||0) - (a.expectativa_votos||0))

  const somaLider  = (c.liderancas || []).reduce((s, l) => s + Number(l.expectativa_votos||0), 0)
  const totalGeral = getTotalExpectativa(bairro)

  totaisEl.style.display = "block"
  const rowsCands = (configSistema.candidatos || []).map(cand => {
    const exp = c.expectativaCidade?.[cand.chave] || 0
    return `<div class="total-row">
      <span>Expectativa ${cand.nome.split(' ')[0]}</span>
      <strong style="color:${cand.cor_texto};">${exp.toLocaleString('pt-BR')}</strong>
    </div>`
  }).join('')
  totaisEl.innerHTML = `
    <div class="total-title">Total filtrado: ${totalGeral.toLocaleString("pt-BR")} votos</div>
    ${rowsCands}
    <div class="total-row">
      <span>Soma das lideranças</span>
      <strong>${somaLider.toLocaleString("pt-BR")}</strong>
    </div>
  `

  countEl.textContent = liderancas.length
  document.getElementById("add-lider-form").style.display  = isVisualizador ? "none" : ""
  document.getElementById("salvar-exp").style.display      = isVisualizador ? "none" : ""

  if (liderancas.length === 0) {
    lista.innerHTML = `<p style="font-size:13px;color:#94a3b8;text-align:center;padding:12px 0;">Nenhuma liderança cadastrada</p>`
    return
  }

  liderancas.forEach((l, i) => {
    const div = document.createElement("div")
    div.className = "lideranca-item"

    const rankClass  = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : ""
    const badge      = getBadge(l.vinculo_politico)
    const fotoHtml   = l.foto
      ? `<img src="${l.foto}" alt="" onerror="this.parentElement.innerHTML='👤'">`
      : `👤`

    const botoesHtml = isVisualizador ? "" : `
      <div class="lideranca-actions">
        <button class="btn-edit"   title="Editar">✏️</button>
        <button class="btn-delete" title="Excluir">🗑️</button>
      </div>
    `

    div.innerHTML = `
      <span class="lideranca-rank ${rankClass}">${i + 1}</span>
      <div class="lideranca-foto-wrap">${fotoHtml}</div>
      <div class="lideranca-details">
        <div class="lideranca-nome">${l.nome}</div>
        <div class="lideranca-contato">${l.contato || ""}</div>
      </div>
      <span class="lideranca-votos">${(l.expectativa_votos||0).toLocaleString("pt-BR")}</span>
      <span class="lideranca-vinculo-badge ${badge.cls}" style="${badge.style}">${badge.label}</span>
      ${botoesHtml}
    `

    div.addEventListener("click", e => {
      if (!e.target.closest(".lideranca-actions")) abrirModalLideranca(l, bairro)
    })

    if (!isVisualizador) {
      div.querySelector(".btn-edit").addEventListener("click",   e => { e.stopPropagation(); abrirModalEditar(l, bairro) })
      div.querySelector(".btn-delete").addEventListener("click", e => { e.stopPropagation(); excluirLideranca(l, bairro) })
    }

    lista.appendChild(div)
  })
}

// ─────────────────────────────────────────────
// MODAL DETALHE
// ─────────────────────────────────────────────
function abrirModalLideranca(l, bairro) {
  const conteudo  = document.getElementById("modal-lideranca-conteudo")
  const distrito  = getDistritoDoBairro(bairro || bairroAtual)
  const _badge     = getBadge(l.vinculo_politico)
  const badgeLabel = (configSistema.candidatos || []).find(c => c.chave === l.vinculo_politico)?.nome || _badge.label
  const fotoHtml   = l.foto ? `<img src="${l.foto}" alt="" onerror="this.parentElement.innerHTML='👤'">` : `👤`

  conteudo.innerHTML = `
    <div class="modal-lider-header">
      <div class="modal-lider-foto">${fotoHtml}</div>
      <div>
        <div class="modal-lider-nome">${l.nome}</div>
        <div class="modal-lider-sub">${bairro || bairroAtual} · ${distrito}</div>
      </div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><div class="modal-field-label">Contato</div><div class="modal-field-value">${l.contato || "—"}</div></div>
      <div class="modal-field"><div class="modal-field-label">Expectativa</div><div class="modal-field-value" style="color:var(--blue-main);font-family:'Sora',sans-serif;">${(l.expectativa_votos||0).toLocaleString("pt-BR")} votos</div></div>
      <div class="modal-field"><div class="modal-field-label">Campanha</div><div class="modal-field-value"><span class="lideranca-vinculo-badge ${_badge.cls}" style="${_badge.style}">${badgeLabel}</span></div></div>
      <div class="modal-field"><div class="modal-field-label">Distrito</div><div class="modal-field-value">${bairro || bairroAtual || "—"}</div></div>
    </div>
  `
  document.getElementById("modal-lideranca").style.display = "flex"
}

// ─────────────────────────────────────────────
// EXCLUIR LIDERANÇA
// ─────────────────────────────────────────────
async function excluirLideranca(l, bairro) {
  if (!confirm(`Excluir "${l.nome}"?`)) return
  try {
    await apiFetch(`/liderancas/${l.id}`, { method: 'DELETE' })
    await carregarTudo()
    repaintMapa()
    renderLiderancas(bairro)
    if (window.GeoMode && window.GeoMode.isAtivo()) window.GeoMode.refreshPins()
  } catch (err) {
    console.error(err)
    alert('Erro ao excluir liderança')
  }
}

// ─────────────────────────────────────────────
// SELECIONAR DISTRITO (clique no mapa)
// ─────────────────────────────────────────────
function selecionarBairro(nomeDistrito, layer) {
  if (layerSelecionado) {
    const old = layerSelecionado.feature.properties[BAIRRO_PROP]
    layerSelecionado.setStyle({
      color: "#1e40af", weight: 1.2,
      fillColor: getCorModo(old),
      fillOpacity: 0.72
    })
  }
  layerSelecionado = layer
  window._piraiLayerSelecionado = layer   // expõe para GeoMode
  bairroAtual = nomeDistrito
  layer.setStyle({ weight: 3.5, color: "#0f172a", fillOpacity: 0.92 })
  // Notifica o Modo Geográfico para corrigir os estilos visuais
  if (window.GeoMode && window.GeoMode.isAtivo()) window.GeoMode.selecionarDistrito(layer)

  document.getElementById("bairro-nome").textContent = nomeDistrito
  document.getElementById("bairro-info").innerHTML =
    `<b>Distrito:</b> ${getDistritoDoBairro(nomeDistrito)}`

  renderLiderancas(nomeDistrito)
}

// ─────────────────────────────────────────────
// SELETOR DISTRITO (sidebar)
// ─────────────────────────────────────────────
document.getElementById("select-distrito").addEventListener("change", e => {
  filtrarDistrito(e.target.value)
  mostrarLiderDistrito(e.target.value)
})

// ─────────────────────────────────────────────
// BUSCAR DISTRITO
// ─────────────────────────────────────────────
document.getElementById("buscar-bairro").addEventListener("input", e => {
  const texto     = normalizar(e.target.value.trim())
  const resultsEl = document.getElementById("buscar-bairro-results")
  resultsEl.innerHTML = ""
  if (!texto || !geoBairros) return

  const matches = []
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    if (normalizar(b).includes(texto)) matches.push({ nome: b, layer })
  })

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="search-result-item">Nenhum distrito encontrado</div>`
    return
  }

  matches.slice(0, 8).forEach(({ nome, layer }) => {
    const div = document.createElement("div")
    div.className = "search-result-item"
    div.innerHTML = `<strong>${nome}</strong><small>${getDistritoDoBairro(nome)}</small>`
    div.addEventListener("click", () => {
      map.fitBounds(layer.getBounds(), { maxZoom: 13 })
      selecionarBairro(nome, layer)
      resultsEl.innerHTML = ""
      document.getElementById("buscar-bairro").value = nome
    })
    resultsEl.appendChild(div)
  })
})

// ─────────────────────────────────────────────
// BUSCAR LIDERANÇA
// ─────────────────────────────────────────────
document.getElementById("buscar-lideranca").addEventListener("input", e => {
  const texto     = normalizar(e.target.value.trim())
  const resultsEl = document.getElementById("buscar-lideranca-results")
  resultsEl.innerHTML = ""
  if (!texto) return

  const resultados = []
  Object.entries(dataCache).forEach(([bairro, dados]) => {
    ;(dados.liderancas || []).forEach(l => {
      if (normalizar(l.nome).includes(texto)) resultados.push({ bairro, lideranca: l })
    })
  })

  if (!resultados.length) {
    resultsEl.innerHTML = `<div class="search-result-item">Nenhuma liderança encontrada</div>`
    return
  }

  resultados.slice(0, 8).forEach(({ bairro, lideranca }) => {
    const div = document.createElement("div")
    div.className = "search-result-item"
    div.innerHTML = `<strong>${lideranca.nome}</strong><small>${bairro} · ${lideranca.contato || ""}</small>`
    div.addEventListener("click", () => {
      if (geoBairros) {
        geoBairros.eachLayer(layer => {
          if (layer.feature.properties[BAIRRO_PROP] === bairro) {
            map.fitBounds(layer.getBounds(), { maxZoom: 13 })
            selecionarBairro(bairro, layer)
          }
        })
      }
      resultsEl.innerHTML = ""
      document.getElementById("buscar-lideranca").value = lideranca.nome
    })
    resultsEl.appendChild(div)
  })
})

// ─────────────────────────────────────────────
// ADICIONAR LIDERANÇA
// ─────────────────────────────────────────────
document.getElementById("add-lideranca").addEventListener("click", async () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel === 'visualizador') { alert('Acesso Negado.'); return }

  const nome    = document.getElementById("lideranca-nome").value.trim()
  const contato = document.getElementById("lideranca-contato").value.trim()
  const vinculo = document.getElementById("lideranca-vinculo").value
  const votos   = Number(document.getElementById("lideranca-votos").value) || 0
  const cep     = document.getElementById("lideranca-cep").value.trim()
  const bairro  = document.getElementById("lideranca-bairro").value.trim()
  const lat     = document.getElementById("lideranca-lat").value
  const lng     = document.getElementById("lideranca-lng").value

  if (!nome) { alert("Informe o nome da liderança."); return }

  // Se distrito selecionado → vai ao submapa de Piraí; caso contrário → mapa estadual (Piraí)
  const cidadeDestino = bairroAtual || 'Piraí'
  const mapaDestino   = bairroAtual ? 'pirai' : null

  try {
    const formData = new FormData()
    formData.append('cidade',            cidadeDestino)
    if (mapaDestino) formData.append('mapa', mapaDestino)
    formData.append('nome',              nome)
    formData.append('contato',           contato)
    formData.append('vinculo_politico',  vinculo)
    formData.append('expectativa_votos', votos)
    if (cep)    formData.append('cep',    cep)
    if (bairro) formData.append('bairro', bairro)
    if (lat)    formData.append('lat',    lat)
    if (lng)    formData.append('lng',    lng)

    await apiFetch('/liderancas', {
      method: 'POST',
      body: formData
    })

    document.getElementById("lideranca-nome").value    = ""
    document.getElementById("lideranca-contato").value = ""
    document.getElementById("lideranca-votos").value   = "0"
    document.getElementById("lideranca-cep").value     = ""
    document.getElementById("lideranca-bairro").value  = ""
    document.getElementById("lideranca-lat").value     = ""
    document.getElementById("lideranca-lng").value     = ""
    document.getElementById("lideranca-cep-status").textContent = ""

    await carregarTudo()
    repaintMapa()
    if (bairroAtual) renderLiderancas(bairroAtual)
    if (window.GeoMode && window.GeoMode.isAtivo()) window.GeoMode.refreshPins()
  } catch (err) {
    console.error(err)
    alert('Erro ao adicionar liderança')
  }
})

// ─────────────────────────────────────────────
// SALVAR EXPECTATIVA
// ─────────────────────────────────────────────
document.getElementById("salvar-exp").addEventListener("click", async () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel === 'visualizador') { alert('Acesso Negado.'); return }
  if (!bairroAtual) return

  const expectativas = {}
  ;(configSistema.candidatos || []).forEach(c => {
    expectativas[c.chave] = Number(document.getElementById('valor-exp-' + c.chave)?.value) || 0
  })

  try {
    await apiFetch('/expectativa-pirai', {
      method: 'POST',
      body: JSON.stringify({ cidade: bairroAtual, expectativas })
    })

    getCacheEntry(bairroAtual).expectativaCidade = { ...expectativas }
    renderLiderancas(bairroAtual)
    repaintMapa()

    const btn = document.getElementById("salvar-exp")
    const prev = btn.textContent
    btn.textContent = "✓ Salvo"
    btn.style.background = "#16a34a"
    setTimeout(() => { btn.textContent = prev; btn.style.background = "" }, 1800)
  } catch (err) {
    console.error(err)
    alert('Erro ao salvar expectativa')
  }
})

// ─────────────────────────────────────────────
// MODO DE VISUALIZAÇÃO
// ─────────────────────────────────────────────
document.querySelectorAll(".modo-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modo-btn").forEach(b => b.classList.remove("ativa"))
    btn.classList.add("ativa")
    modoVisualizacao = btn.dataset.modo
    atualizarLegenda()
    repaintMapa()
  })
})

function atualizarLegenda() {
  const gradBar = document.getElementById("legenda-grad-bar")
  const labels  = document.getElementById("legenda-grad-labels")
  const steps   = document.getElementById("legenda-steps")
  const titulo  = document.getElementById("legenda-titulo")

  if (modoVisualizacao === 'votosValidos') {
    gradBar.style.background = "linear-gradient(to right,#f7fbff,#c6dbef,#6baed6,#2171b5,#084594)"
    labels.innerHTML  = "<span>0</span><span>2k</span><span>10k</span><span>20k+</span>"
    steps.innerHTML   = `
      <div class="legenda-row"><div class="legenda-swatch" style="background:#084594;"></div><span>20.000+ <small>muito alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#2171b5;"></div><span>10.000–19.999 <small>alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#4292c6;"></div><span>5.000–9.999 <small>moderado</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#6baed6;"></div><span>2.000–4.999 <small>baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#c6dbef;"></div><span>1–1.999 <small>muito baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#f7fbff;"></div><span>0 <small>sem dados</small></span></div>`
    titulo.textContent = "Votos Válidos 2022"
  } else if (modoVisualizacao === 'liderancas') {
    gradBar.style.background = "linear-gradient(to right,#e5f5f9,#99d8c9,#41ae76,#238b45,#005a32)"
    labels.innerHTML  = "<span>0</span><span>1</span><span>5</span><span>10+</span>"
    steps.innerHTML   = `
      <div class="legenda-row"><div class="legenda-swatch" style="background:#005a32;"></div><span>10+ <small>muito alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#238b45;"></div><span>5–9 <small>alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#41ae76;"></div><span>2–4 <small>moderado</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#99d8c9;"></div><span>1 <small>baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#e5f5f9;"></div><span>0 <small>sem lideranças</small></span></div>`
    titulo.textContent = "Lideranças"
  } else {
    const cand = (configSistema.candidatos||[]).find(c => c.chave === filtroCampanha)
    const base = (cand && cand.cor_mapa) ? cand.cor_mapa : '#cb181d'
    const pal  = _paletaMeta(base)
    gradBar.style.background = `linear-gradient(to right,${pal[0]},${pal[1]},${pal[2]},${pal[3]},${pal[4]},${pal[5]})`
    labels.innerHTML  = "<span>0</span><span>300</span><span>1k</span><span>5k+</span>"
    steps.innerHTML   = `
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[5]};"></div><span>5.000+ <small>muito alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[4]};"></div><span>2.000–4.999 <small>alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[3]};"></div><span>1.000–1.999 <small>moderado</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[2]};"></div><span>300–999 <small>baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[1]};"></div><span>1–299 <small>muito baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:${pal[0]};"></div><span>0 <small>sem expectativa</small></span></div>`
    titulo.textContent = "Expectativa"
  }
}

// ─────────────────────────────────────────────
// INICIAR MAPA — chamado por iniciarAplicacao()
// ─────────────────────────────────────────────
window.iniciarMapa = async function() {
  await carregarConfig()

  // Piraí fica na região do Médio Paraíba / Centro-Sul RJ
  map = L.map('map', { minZoom: 9, maxZoom: 18 }).setView([-22.63, -43.90], 11)
  window.map = map
  setTimeout(() => map.invalidateSize(), 200)

  // Clique em área sem polígono → pin
  map.on('click', function(e) {
    if (!window.modoAdicionarPin) return
    window.modoAdicionarPin = false
    if (typeof window.syncBotoesPins === 'function') window.syncBotoesPins()
    window.novoPinLatLng = e.latlng
    window.novoPinCidade = ''
    if (typeof window.abrirModalPin === 'function') window.abrirModalPin()
  })

  // Carrega GeoJSON dos distritos de Piraí
  fetch("geo/pirai.geojson")
    .then(r => r.json())
    .then(data => {
      geoBairros = L.geoJSON(data, {
        style: {
          color: "#1e40af",
          weight: 1.2,
          fillOpacity: 0.72,
          fillColor: "#e8f4ff"
        },
        onEachFeature: (feature, layer) => {
          const distrito = feature.properties[BAIRRO_PROP]
          layer.on("click", (e) => {
            if (window.modoAdicionarPin) {
              window.modoAdicionarPin = false
              if (typeof window.syncBotoesPins === 'function') window.syncBotoesPins()
              window.novoPinLatLng = e.latlng
              window.novoPinCidade = distrito
              if (typeof window.abrirModalPin === 'function') window.abrirModalPin()
              return
            }
            selecionarBairro(distrito, layer)
          })
          // Label de nome no centro do polígono
          const center = layer.getBounds().getCenter()
          L.marker(center, {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;font-weight:700;color:rgba(15,23,42,0.7);text-shadow:0 1px 3px rgba(255,255,255,0.9);text-align:center;width:140px;line-height:1.3;pointer-events:none;user-select:none;">${distrito}</div>`,
              iconSize: [140, 26],
              iconAnchor: [70, 13]
            })
          }).addTo(map)
        }
      }).addTo(map)
      window.geoBairros = geoBairros   // expõe para GeoMode

      map.fitBounds(geoBairros.getBounds(), { padding: [20, 20] })
      map.setMinZoom(Math.max(map.getZoom() - 1, 9))
      map.setMaxBounds(geoBairros.getBounds().pad(0.5))
      return carregarTudo()
    })
    .then(() => {
      repaintMapa()
      if (window.GeoMode && window.GeoMode.isAtivo()) window.GeoMode.refreshPins()
      if (window._distritoFixo) {
        filtrarDistrito(window._distritoFixo)
        mostrarLiderDistrito(window._distritoFixo)
      }
    })
    .catch(err => {
      console.error("Erro ao inicializar mapa de Piraí:", err)
    })
}

// ─────────────────────────────────────────────
// MODAL DE EDIÇÃO
// ─────────────────────────────────────────────
let _editLideranca = null
let _editBairro    = null

function abrirModalEditar(l, bairro) {
  _editLideranca = l
  _editBairro    = bairro
  document.getElementById('edit-nome').value    = l.nome    || ''
  document.getElementById('edit-contato').value = l.contato || ''
  document.getElementById('edit-votos').value   = l.expectativa_votos || 0
  document.getElementById('edit-vinculo').value = l.vinculo_politico || 'ambos'
  // Campos geográficos
  document.getElementById('edit-cep').value    = l.cep    || ''
  document.getElementById('edit-bairro').value = l.bairro || ''
  document.getElementById('edit-lat').value    = l.lat    || ''
  document.getElementById('edit-lng').value    = l.lng    || ''
  document.getElementById('edit-cep-status').textContent = l.lat ? `✓ localizado (${Number(l.lat).toFixed(4)}, ${Number(l.lng).toFixed(4)})` : ''
  document.getElementById('edit-cep-status').className = l.lat ? 'cep-status ok' : 'cep-status'
  document.getElementById('modal-editar').style.display = 'flex'
}

function fecharModalEditar() {
  document.getElementById('modal-editar').style.display = 'none'
}

document.getElementById('edit-salvar-btn').addEventListener('click', async () => {
  if (!_editLideranca) return
  const nome    = document.getElementById('edit-nome').value.trim()
  const contato = document.getElementById('edit-contato').value.trim()
  const votos   = Number(document.getElementById('edit-votos').value) || 0
  const vinculo = document.getElementById('edit-vinculo').value
  const cep     = document.getElementById('edit-cep').value.trim()
  const bairroG = document.getElementById('edit-bairro').value.trim()
  const lat     = document.getElementById('edit-lat').value
  const lng     = document.getElementById('edit-lng').value
  if (!nome) { alert('Nome é obrigatório'); return }

  try {
    const formData = new FormData()
    formData.append('nome',              nome)
    formData.append('contato',           contato)
    formData.append('expectativa_votos', votos)
    formData.append('vinculo_politico',  vinculo)
    formData.append('cidade',            _editBairro || bairroAtual)
    formData.append('mapa',              'pirai')
    if (cep)     formData.append('cep',    cep)
    if (bairroG) formData.append('bairro', bairroG)
    if (lat)     formData.append('lat',    lat)
    if (lng)     formData.append('lng',    lng)

    await apiFetch(`/liderancas/${_editLideranca.id}`, {
      method: 'PUT',
      body: formData
    })

    fecharModalEditar()
    await carregarTudo()
    repaintMapa()
    renderLiderancas(_editBairro || bairroAtual)
    if (window.GeoMode && window.GeoMode.isAtivo()) window.GeoMode.refreshPins()
  } catch (err) {
    console.error(err)
    alert('Erro ao editar liderança')
  }
})
