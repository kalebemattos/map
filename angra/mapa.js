const BAIRRO_PROP = "NM_BAIRRO" // ajuste para o campo correto do seu GeoJSON

// ─────────────────────────────────────────────
// VOTOS VÁLIDOS 2022 (embutidos)
// ─────────────────────────────────────────────
const VOTOS_VALIDOS = {
  "CENTRO": 31380, "JAPUÍBA": 22124, "PARQUE MAMBUCABA": 18612,
  "JACUECANGA": 14318, "FRADE": 13161, "BALNEÁRIO": 8599,
  "MONSUABA": 8340, "BRACUÍ": 7830, "CAMORIM": 7492,
  "PARQUE BELÉM": 6615, "ILHA GRANDE": 6118, "CAMPO BELO": 5746,
  "AREAL": 4471, "SÃO BENTO": 4337, "ENSEADA": 3411,
  "PARQUE DAS PALMEIRAS": 3312, "GARATUCAIA": 2924,
  "SERRA D'ÁGUA": 2049, "PRAIA BRAVA": 1698, "PONTAL": 1650,
  "VILA HISTÓRICA DE MAMBUCABA": 1541, "BANQUETA": 1493,
  "MARINAS": 1492, "BONFIM": 1492, "GAMBOA DO BELÉM": 1429,
  "MORRO DA CRUZ": 1150, "VILA VELHA": 1030, "PORTO GALO": 895,
  "CAPUTERA": 838, "ILHA DA GIPÓIA": 260
}

// Modo de visualização: 'expectativa' | 'votosValidos' | 'liderancas'
let modoVisualizacao = 'expectativa'


// =============================================================
// MAPA DE ANGRA DOS REIS – mapa.js
// =============================================================

// API_URL é definido pelo auth.js como window.API_URL

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let map = null

let geoBairros       = null
let bairroAtual      = null
let layerSelecionado = null
let filtroCampanha   = "ambos"

// Cache local: { "CENTRO": { liderancas:[], expectativaCidade:{ [chave]: 0, ... } }, ... }
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

  const res = await fetch(`${window.API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

async function carregarConfig() {
  try {
    const token = localStorage.getItem('token')
    const r = await fetch(window.API_URL + '/config', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    })
    if (!r.ok) return
    configSistema = await r.json()
    injetarCandidatosAngra()
  } catch (e) { console.warn('[config] não carregada:', e) }
}

// Helper: dado vinculo_politico, retorna { cls, style, label }
function getBadge(vinculo) {
  const cand = (configSistema.candidatos || []).find(c => c.chave === vinculo)
  if (cand) return {
    cls:   'badge-cand',
    style: `background:${cand.cor_fundo};color:${cand.cor_texto};`,
    label: cand.nome.split(' ')[0]
  }
  return { cls: 'badge-ambos', style: '', label: 'Ambos' }
}

function injetarCandidatosAngra() {
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

  // 2. Inputs de expectativa por bairro
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
}

// ─────────────────────────────────────────────
// CARREGAR TUDO DO BACKEND
// ─────────────────────────────────────────────
async function carregarTudo() {

  // Lideranças
  try {
    const res  = await apiFetch('/liderancas?mapa=angra')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(c => {
        const raw = c.bairro || c.cidade
        initCache(raw)
        getCacheEntry(raw).liderancas = c.liderancas || []
      })
    }
  } catch (e) { console.error('Erro lideranças:', e) }

  // Expectativas por bairro (separadas por campanha)
  try {
    const res  = await apiFetch('/expectativa-angra-todas')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(e => {
        const raw = e.bairro || e.cidade
        initCache(raw)
        getCacheEntry(raw).expectativaCidade = Object.fromEntries(
          (configSistema.candidatos || []).map(c => [c.chave, Number(e['expectativa_' + c.chave] || 0)])
        )
      })
    }
  } catch (e) { console.error('Erro expectativas:', e) }
}

// ─────────────────────────────────────────────
// NORMALIZAÇÃO DE CHAVE DO CACHE
// Garante que nomes do GeoJSON (com acento, grafia variada)
// batem com os nomes enviados pelo painel (maiúsculas sem acento)
// ─────────────────────────────────────────────
function normalizarChave(texto) {
  if (!texto) return ""
  return texto.toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

// Índice invertido: chave normalizada → chave original no cache
const _cacheIndex = {}

function initCache(bairro) {
  if (!bairro) return
  const norm = normalizarChave(bairro)
  // Se já existe uma chave normalizada igual, reutiliza a chave original existente
  if (_cacheIndex[norm]) {
    const existing = _cacheIndex[norm]
    if (existing !== bairro && !dataCache[bairro]) {
      // aponta para o mesmo objeto
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
  // Tenta direto
  if (dataCache[bairro]) return dataCache[bairro]
  // Tenta via normalização
  const norm = normalizarChave(bairro)
  const original = _cacheIndex[norm]
  if (original && dataCache[original]) return dataCache[original]
  // Cria entrada nova
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

function getDistritoDoBairro(bairro) {
  if (!bairro) return "DESCONHECIDO"
  const n = normalizar(bairro)
  for (const d in distritos) {
    for (const b of distritos[d].bairros) {
      if (normalizar(b) === n) return d
    }
  }
  return "DESCONHECIDO"
}

// ─────────────────────────────────────────────
// CÁLCULO DE EXPECTATIVA — idêntico ao mapa RJ
//   "ambos"    → celia + todas as lideranças
//   "celia"    → celia + lideranças celia/ambos
//   "fernando" → fernando + lideranças fernando/ambos
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
// COR
// ─────────────────────────────────────────────
function corPorExpectativa(v) {
  if (v >= 5000) return "#67000d"
  if (v >= 2000) return "#a50f15"
  if (v >= 1000) return "#cb181d"
  if (v >= 300)  return "#fb6a4a"
  if (v >  0)    return "#fcae91"
  return "#e8f4ff"
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
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    layer.setStyle({
      color:       layer === layerSelecionado ? "#0f172a" : "#1e40af",
      weight:      layer === layerSelecionado ? 3.5 : 0.9,
      fillColor:   getCorModo(b),
      fillOpacity: layer === layerSelecionado ? 0.92 : 0.72
    })
  })
  calcularTotalGeral()
}

// ─────────────────────────────────────────────
// FILTRAR DISTRITO
// ─────────────────────────────────────────────
function filtrarDistrito(distrito) {
  if (!geoBairros) return
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    const d = getDistritoDoBairro(b)
    if (!distrito) {
      layer.setStyle({ color:"#1e40af", weight:0.9, fillColor:getCorModo(b), fillOpacity:0.72 })
      return
    }
    if (d === distrito) {
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

  // Preencher inputs de expectativa separados
  ;(configSistema.candidatos || []).forEach(cand => {
    const input = document.getElementById('valor-exp-' + cand.chave)
    if (input) input.value = c.expectativaCidade?.[cand.chave] || 0
  })

  // Filtrar por campanha ativa
  let liderancas = c.liderancas || []
  if (filtroCampanha !== "ambos") {
    liderancas = liderancas.filter(
      l => l.vinculo_politico === filtroCampanha || l.vinculo_politico === "ambos"
    )
  }

  // Ranking por expectativa
  liderancas = [...liderancas].sort((a, b) => (b.expectativa_votos||0) - (a.expectativa_votos||0))

  // Totais do painel
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

  // Mostrar/esconder form e botão salvar
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
    const badgeClass = badge.cls
    const badgeStyle = badge.style
    const badgeLabel = badge.label

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
      <span class="lideranca-vinculo-badge ${badgeClass}" style="${badgeStyle}">${badgeLabel}</span>
      ${botoesHtml}
    `

    div.addEventListener("click", e => {
      if (!e.target.closest(".lideranca-actions")) abrirModalLideranca(l, bairro)
    })

    if (!isVisualizador) {
      div.querySelector(".btn-edit").addEventListener("click",   e => { e.stopPropagation(); editarLideranca(l, bairro) })
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
  const badgeClass = _badge.cls
  const badgeStyle = _badge.style
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
      <div class="modal-field"><div class="modal-field-label">Campanha</div><div class="modal-field-value"><span class="lideranca-vinculo-badge ${badgeClass}" style="${badgeStyle}">${badgeLabel}</span></div></div>
      <div class="modal-field"><div class="modal-field-label">Bairro</div><div class="modal-field-value">${bairro || bairroAtual || "—"}</div></div>
    </div>
  `
  document.getElementById("modal-lideranca").style.display = "flex"
}

// ─────────────────────────────────────────────
// EDITAR LIDERANÇA
// ─────────────────────────────────────────────
function editarLideranca(l, bairro) {
  abrirModalEditar(l, bairro)
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
  } catch (err) {
    console.error(err)
    alert('Erro ao excluir liderança')
  }
}

// ─────────────────────────────────────────────
// ADICIONAR LIDERANÇA
// ─────────────────────────────────────────────
document.getElementById("add-lideranca").addEventListener("click", async () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel === 'visualizador') { alert('Acesso Negado.'); return }
  if (!bairroAtual) { alert('Selecione um bairro primeiro.'); return }

  const nome    = document.getElementById("lideranca-nome").value.trim()
  const contato = document.getElementById("lideranca-contato").value.trim()
  const vinculo = document.getElementById("lideranca-vinculo").value
  const votos   = Number(document.getElementById("lideranca-votos").value) || 0

  if (!nome) { alert("Informe o nome da liderança."); return }

  try {
    const formData = new FormData()
    formData.append('cidade',            bairroAtual)
    formData.append('mapa',              'angra')
    formData.append('nome',              nome)
    formData.append('contato',           contato)
    formData.append('vinculo_politico',  vinculo)
    formData.append('expectativa_votos', votos)

    await apiFetch('/liderancas', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
      body: formData
    })

    document.getElementById("lideranca-nome").value    = ""
    document.getElementById("lideranca-contato").value = ""
    document.getElementById("lideranca-votos").value   = "0"

    await carregarTudo()
    repaintMapa()
    renderLiderancas(bairroAtual)
  } catch (err) {
    console.error(err)
    alert('Erro ao adicionar liderança')
  }
})

// ─────────────────────────────────────────────
// SALVAR EXPECTATIVA — separada por campanha
// ─────────────────────────────────────────────
document.getElementById("salvar-exp").addEventListener("click", async () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel === 'visualizador') { alert('Acesso Negado.'); return }
  if (!bairroAtual) return

  const payload = { cidade: bairroAtual }
  ;(configSistema.candidatos || []).forEach(c => {
    payload[c.chave] = Number(document.getElementById('valor-exp-' + c.chave)?.value) || 0
  })

  try {
    await apiFetch('/expectativa-angra', {
      method: 'POST',
      body: JSON.stringify(payload)
    })

    // Atualiza cache local imediatamente
    const novaExp = Object.fromEntries(
      (configSistema.candidatos || []).map(c => [c.chave, payload[c.chave]])
    )
    getCacheEntry(bairroAtual).expectativaCidade = novaExp

    renderLiderancas(bairroAtual)
    repaintMapa()

    // Feedback no botão
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

// Seletor de campanha: listeners registrados dinamicamente por injetarCandidatosAngra()

// ─────────────────────────────────────────────
// SELECIONAR BAIRRO
// ─────────────────────────────────────────────
function selecionarBairro(bairroNome, layer) {
  if (layerSelecionado) {
    const old = layerSelecionado.feature.properties[BAIRRO_PROP]
    layerSelecionado.setStyle({
      color: "#1e40af", weight: 0.9,
      fillColor: getCorModo(old),
      fillOpacity: 0.72
    })
  }
  layerSelecionado = layer
  bairroAtual = bairroNome
  layer.setStyle({ weight: 3.5, color: "#0f172a", fillOpacity: 0.92 })

  document.getElementById("bairro-nome").textContent = bairroNome
  document.getElementById("bairro-info").innerHTML =
    `<b>Distrito:</b> ${getDistritoDoBairro(bairroNome)}`

  renderLiderancas(bairroNome)
}

// ─────────────────────────────────────────────
// SELETOR DISTRITO
// ─────────────────────────────────────────────
document.getElementById("select-distrito").addEventListener("change", e => {
  filtrarDistrito(e.target.value)
  mostrarLiderDistrito(e.target.value)
})

// ─────────────────────────────────────────────
// BUSCAR BAIRRO
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
    resultsEl.innerHTML = `<div class="search-result-item">Nenhum bairro encontrado</div>`
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
// SELETOR DE MODO DE VISUALIZAÇÃO
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
    gradBar.style.background = "linear-gradient(to right,#fee5d9,#fcae91,#fb6a4a,#cb181d,#a50f15,#67000d)"
    labels.innerHTML  = "<span>0</span><span>300</span><span>1k</span><span>5k+</span>"
    steps.innerHTML   = `
      <div class="legenda-row"><div class="legenda-swatch" style="background:#67000d;"></div><span>5.000+ <small>muito alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#a50f15;"></div><span>2.000–4.999 <small>alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#cb181d;"></div><span>1.000–1.999 <small>moderado</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#fb6a4a;"></div><span>300–999 <small>baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#fcae91;"></div><span>1–299 <small>muito baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#fee5d9;"></div><span>0 <small>sem expectativa</small></span></div>`
    titulo.textContent = "Expectativa"
  }
}

// ─────────────────────────────────────────────
// GEOJSON — chamado pelo iniciarAplicacao() após login
// ─────────────────────────────────────────────
window.iniciarMapa = async function() {
  await carregarConfig()
  map = L.map('map').setView([-23.01, -44.32], 11)
  window.map = map   // expõe para index.html (pins, invalidateSize, etc.)
  setTimeout(() => map.invalidateSize(), 200)

  // Handler de pin para cliques em áreas sem polígono de bairro
  // (para bairros com polígono, o onEachFeature já cuida — e zera o flag antes deste rodar)
  map.on('click', function(e) {
    if (!window.modoAdicionarPin) return
    // Se chegou aqui, o clique foi em área sem bairro (GeoJSON handler já limpou o flag para bairros)
    window.modoAdicionarPin = false
    if (typeof window.syncBotoesPins === 'function') window.syncBotoesPins()
    window.novoPinLatLng = e.latlng
    window.novoPinCidade = ''
    if (typeof window.abrirModalPin === 'function') window.abrirModalPin()
  })

  fetch("geo/angra_limite.geojson")
    .then(r => r.json())
    .then(data => {
      const limite = L.geoJSON(data, {
        style: { color: "#0f5132", weight: 2.5, fillOpacity: 0, interactive: false }
      }).addTo(map)
      map.fitBounds(limite.getBounds())
    })
    .then(() => fetch("geo/angra_bairros.geojson"))
    .then(r => r.json())
    .then(data => {
      geoBairros = L.geoJSON(data, {
        style: {
          color: "#1e40af",
          weight: 0.9,
          fillOpacity: 0.72,
          fillColor: "#e8f4ff"
        },
        onEachFeature: (feature, layer) => {
          const bairro = feature.properties[BAIRRO_PROP]
          layer.on("click", (e) => {
            // Modo adicionar pin: intercepta o clique no bairro
            if (window.modoAdicionarPin) {
              window.modoAdicionarPin = false
              if (typeof window.syncBotoesPins === 'function') window.syncBotoesPins()
              window.novoPinLatLng = e.latlng
              window.novoPinCidade = bairro
              if (typeof window.abrirModalPin === 'function') window.abrirModalPin()
              return
            }
            selecionarBairro(bairro, layer)
          })
          const center = layer.getBounds().getCenter()
          L.marker(center, {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;color:rgba(15,23,42,0.55);text-shadow:0 1px 3px rgba(255,255,255,0.9);text-align:center;width:120px;line-height:1.2;opacity:0.55;pointer-events:none;user-select:none;">${bairro}</div>`,
              iconSize: [120, 20],
              iconAnchor: [60, 10]
            })
          }).addTo(map)
        }
      }).addTo(map)
      return carregarTudo()
    })
    .then(() => {
      repaintMapa()
      // Se o usuário é lider_distrito_angra, aplica o filtro do seu distrito
      if (window._distritoFixo) {
        filtrarDistrito(window._distritoFixo)
        mostrarLiderDistrito(window._distritoFixo)
      }
    })
    .catch(err => {
      console.error("Erro ao inicializar mapa:", err)
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
  document.getElementById('edit-nome').value    = l.nome || ''
  document.getElementById('edit-contato').value = l.contato || ''
  document.getElementById('edit-votos').value   = l.expectativa_votos || 0
  document.getElementById('edit-vinculo').value = l.vinculo_politico || 'ambos'
  const modal = document.getElementById('modal-editar')
  modal.style.display = 'flex'
}

function fecharModalEditar() {
  document.getElementById('modal-editar').style.display = 'none'
  _editLideranca = null
  _editBairro    = null
}

// Guarda null: edit-salvar-btn pode não existir no DOM quando este script carrega
;(function() {
  const el = document.getElementById('edit-salvar-btn')
  if (el) { el.addEventListener('click', handler); return }
  document.addEventListener('DOMContentLoaded', () => {
    const e2 = document.getElementById('edit-salvar-btn')
    if (e2) e2.addEventListener('click', handler)
  })
  async function handler() {
  if (!_editLideranca) return
  const btn = document.getElementById('edit-salvar-btn')
  btn.textContent = 'Salvando...'
  btn.disabled = true
  try {
    await apiFetch(`/liderancas/${_editLideranca.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome:              document.getElementById('edit-nome').value.trim(),
        contato:           document.getElementById('edit-contato').value.trim(),
        expectativa_votos: Number(document.getElementById('edit-votos').value) || 0,
        vinculo_politico:  document.getElementById('edit-vinculo').value
      })
    })
    fecharModalEditar()
    await carregarTudo()
    repaintMapa()
    renderLiderancas(bairroAtual)
  } catch (err) {
    console.error(err)
    alert('Erro ao salvar')
  } finally {
    btn.textContent = 'Salvar'
    btn.disabled = false
  }
  }
})()

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModalEditar()
})