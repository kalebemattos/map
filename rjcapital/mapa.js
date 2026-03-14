const BAIRRO_PROP = "NM_BAIRRO" // ajuste para o campo correto do seu GeoJSON

// ─────────────────────────────────────────────
// VOTOS VÁLIDOS 2022 (embutidos)
// ─────────────────────────────────────────────
const VOTOS_VALIDOS = {
  "CAMPO GRANDE": 362473, "SANTA CRUZ": 194888, "TIJUCA": 189075,
  "REALENGO": 173554, "BANGU": 155773, "COPACABANA": 145645,
  "TAQUARA": 130249, "BARRA DA TIJUCA": 125207, "PACIENCIA": 110258,
  "BONSUCESSO": 108233, "IRAJÁ": 97220, "RAMOS": 88401,
  "PADRE MIGUEL": 81626, "PENHA": 81265, "BOTAFOGO": 78220,
  "ANCHIETA": 71457, "FREGUESIA JPA": 71219, "VILA ISABEL": 70729,
  "SENADOR CAMARÁ": 70114, "MEIER": 69733, "PAVUNA": 68793,
  "RECREIO": 61108, "CURICICA": 60632, "OLARIA": 59334,
  "GUARATIBA": 58772, "PRAÇA SECA": 56815, "COSMOS": 54410,
  "VILA KENNEDY": 51592, "LARANJEIRAS": 50921, "RIO DAS PEDRAS": 50901,
  "GUADALUPE": 50564, "SÃO CONRADO": 49367, "ROCHA MIRANDA": 49232,
  "ENGENHO DE DENTRO": 48079, "MADUREIRA": 47896, "LEBLON": 47696,
  "SANTÍSSIMO": 46792, "MARECHAL HERMES": 46249, "CIDADE DE DEUS": 44885,
  "VILA DA PENHA": 44862, "CENTRO": 44777, "PIEDADE": 44085,
  "INHOAÍBA": 44079, "ENGENHO NOVO": 43476, "SÃO CRISTÓVÃO": 43101,
  "INHAUMA": 41795, "RIO COMPRIDO": 41735, "PENHA CIRCULAR": 41603,
  "GRAJAÚ": 41422, "VILA VALQUEIRE": 41379, "SEPETIBA": 40927,
  "BRÁS DE PINA": 40926, "IPANEMA": 40793, "ANDARAÍ": 39177,
  "CATETE": 39061, "FLAMENGO": 38696, "TANQUE": 38635,
  "CASCADURA": 38082, "CACHAMBI": 37044, "JARDIM AMÉRICA": 36671,
  "PEDRA DE GUARATIBA": 36324, "MAGALHÃES BASTOS": 35804,
  "VAZ LOBO": 35643, "GÁVEA": 34423, "CORDOVIL": 33973,
  "HIGIENÓPOLIS": 33941, "JARDIM GUANABARA": 33679,
  "DEL CASTILHO": 32265, "OSWALDO CRUZ": 32210,
  "ENGENHO DA RAINHA": 31439, "BENTO RIBEIRO": 31379,
  "BENFICA": 31075, "QUINTINO BOCAIUVA": 29269,
  "RICARDO DE ALBUQUERQUE": 29163, "PECHINCHA": 28656,
  "COELHO NETO": 27553, "JACARÉ": 26096, "HONÓRIO GURGEL": 25654,
  "ANIL": 24679, "SANTA TERESA": 23198, "TODOS OS SANTOS": 23142,
  "COCOTÁ": 23069, "PILARES": 22764, "MARACANÃ": 22600,
  "COLÉGIO": 22454, "VILA KOSMOS": 21300, "COSTA BARROS": 21256,
  "PORTUGUESA": 20818, "ITANHANGÁ": 20164, "DEODORO": 19770,
  "LINS DE VASCONCELOS": 19675, "VIGÁRIO GERAL": 19537,
  "SENADOR VASCONCELOS": 19518, "JARDIM BANGU": 19513,
  "CAMORIM": 19467, "LAGOA": 19046, "CAJU": 18789,
  "PARADA DE LUCAS": 18430, "GARDENIA AZUL": 17968,
  "FREGUESIA (ILHA DO GOVERNADOR)": 17076, "ENCANTADO": 17067,
  "GALEÃO": 16980, "VICENTE DE CARVALHO": 16835,
  "VISTA ALEGRE": 16783, "BANCÁRIOS": 16738, "ROCHA": 16447,
  "HUMAITA": 16193, "CAVALCANTI": 16100, "CACUIA": 16007,
  "JARDIM BOTÂNICO": 15952, "VARGEM GRANDE": 15656,
  "CAMPINHO": 15367, "ILHA DE GUARATIBA": 15126,
  "JARDIM SULACAP": 14643, "MARIA DA GRAÇA": 14158,
  "LEME": 13618, "TURIAÇÚ": 13411, "VARGEM PEQUENA": 13329,
  "PRAÇA DA BANDEIRA": 13258, "VIDIGAL": 12705,
  "BAIRRO DE FÁTIMA": 12191, "RIACHUELO": 12041, "ESTÁCIO": 10462,
  "URCA": 10344, "GUARABU": 10225, "ÁGUA SANTA": 9853,
  "MONERÓ": 9840, "TRIAGEM": 9732, "TAUÁ": 9564, "ZUMBI": 9561,
  "ACARI": 9360, "COSME VELHO": 9200, "PARQUE COLÚMBIA": 9129,
  "AUGUSTO VASCONCELOS": 9091, "ALTO DA BOA VISTA": 8229,
  "TOMÁS COELHO": 7269, "CATIRI": 7121, "MANGUEIRA": 7075,
  "NOVA SEPETIBA": 6981, "BARROS FILHO": 6844,
  "BARRA DE GUARATIBA": 6756, "SANTO CRISTO": 6732,
  "RIBEIRA": 6699, "LAPA": 5906, "SAUDE": 5779, "SAMPAIO": 5232,
  "TOMAS COELHO": 4427, "GAMBOA": 4201, "ABOLIÇÃO": 3947,
  "DENDE": 3796, "ENGENHEIRO LEAL": 3660, "GLÓRIA": 3575,
  "PAQUETÁ": 3567, "SÃO FRANCISCO XAVIER": 3438,
  "MANGUINHOS": 3109, "CIDADE NOVA": 2775, "PARQUE ANCHIETA": 2567,
  "TUBIACANGA": 1764, "FUNDÃO": 1734, "ROCINHA": 1682,
  "SÃO JORGE": 1249, "VILA MILITAR": 1045
}

// Modo de visualização: 'expectativa' | 'votosValidos' | 'liderancas'
let modoVisualizacao = 'expectativa'


// =============================================================
// MAPA RIO DE JANEIRO (Capital) – mapa.js
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

// Cache local: { "CENTRO": { liderancas:[], expectativaCidade:{ celia:0, fernando:0 } }, ... }
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
// CARREGAR TUDO DO BACKEND
// ─────────────────────────────────────────────
async function carregarTudo() {

  // Lideranças
  try {
    const res  = await apiFetch('/liderancas?mapa=rjcapital')
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
    const res  = await apiFetch('/expectativa-rjcapital-todas')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(e => {
        const raw = e.bairro || e.cidade
        initCache(raw)
        getCacheEntry(raw).expectativaCidade = {
          celia:    Number(e.expectativa_celia    || 0),
          fernando: Number(e.expectativa_fernando || 0)
        }
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
      expectativaCidade: { celia: 0, fernando: 0 }
    }
  }
  _cacheIndex[norm] = bairro
}

function getCacheEntry(bairro) {
  if (!bairro) return { liderancas: [], expectativaCidade: { celia: 0, fernando: 0 } }
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

  const expCidade = filtroCampanha === "fernando"
    ? Number(c.expectativaCidade?.fernando || 0)
    : Number(c.expectativaCidade?.celia    || 0)

  const somaLiderancas = (c.liderancas || []).reduce((s, l) => {
    const v = Number(l.expectativa_votos || 0)
    if (filtroCampanha === "ambos")    return s + v
    if (filtroCampanha === "fernando") return (l.vinculo_politico === "fernando" || l.vinculo_politico === "ambos") ? s + v : s
    return (l.vinculo_politico === "celia" || l.vinculo_politico === "ambos") ? s + v : s
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
  if (v >= 150000) return "#084594"
  if (v >= 80000)  return "#2171b5"
  if (v >= 40000)  return "#4292c6"
  if (v >= 15000)  return "#6baed6"
  if (v >  0)      return "#c6dbef"
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
  document.getElementById("valor-exp-celia").value    = c.expectativaCidade?.celia    || 0
  document.getElementById("valor-exp-fernando").value = c.expectativaCidade?.fernando || 0

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
  const expCelia    = c.expectativaCidade?.celia    || 0
  const expFernando = c.expectativaCidade?.fernando || 0
  const somaLider   = (c.liderancas || []).reduce((s, l) => s + Number(l.expectativa_votos||0), 0)
  const totalGeral  = getTotalExpectativa(bairro)

  totaisEl.style.display = "block"
  totaisEl.innerHTML = `
    <div class="total-title">Total filtrado: ${totalGeral.toLocaleString("pt-BR")} votos</div>
    <div class="total-row">
      <span>Expectativa Célia</span>
      <strong style="color:#9d174d;">${expCelia.toLocaleString("pt-BR")}</strong>
    </div>
    <div class="total-row">
      <span>Expectativa Fernando</span>
      <strong style="color:#5b21b6;">${expFernando.toLocaleString("pt-BR")}</strong>
    </div>
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
    const badgeClass = l.vinculo_politico === "celia"    ? "badge-celia"
                     : l.vinculo_politico === "fernando" ? "badge-fernando"
                     : "badge-ambos"
    const badgeLabel = l.vinculo_politico === "celia"    ? "Célia"
                     : l.vinculo_politico === "fernando" ? "Fernando"
                     : "Ambos"

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
      <span class="lideranca-vinculo-badge ${badgeClass}">${badgeLabel}</span>
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
  const badgeClass = l.vinculo_politico === "celia" ? "badge-celia" : l.vinculo_politico === "fernando" ? "badge-fernando" : "badge-ambos"
  const badgeLabel = l.vinculo_politico === "celia" ? "Célia Jordão" : l.vinculo_politico === "fernando" ? "Fernando Jordão" : "Ambos"
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
      <div class="modal-field"><div class="modal-field-label">Campanha</div><div class="modal-field-value"><span class="lideranca-vinculo-badge ${badgeClass}">${badgeLabel}</span></div></div>
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
    formData.append('mapa',              'rjcapital')
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

  const celia    = Number(document.getElementById("valor-exp-celia").value)    || 0
  const fernando = Number(document.getElementById("valor-exp-fernando").value) || 0

  try {
    await apiFetch('/expectativa-rjcapital', {
      method: 'POST',
      body: JSON.stringify({ cidade: bairroAtual, celia, fernando })
    })

    // Atualiza cache local imediatamente
    getCacheEntry(bairroAtual).expectativaCidade = { celia, fernando }

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

// ─────────────────────────────────────────────
// SELETOR DE CAMPANHA
// ─────────────────────────────────────────────
document.querySelectorAll(".campanha-opcao").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".campanha-opcao").forEach(e => e.classList.remove("ativa"))
    el.classList.add("ativa")
    filtroCampanha = el.dataset.campanha
    document.getElementById("overlay-campanha-badge").textContent =
      filtroCampanha === "ambos" ? "Ambos" : filtroCampanha === "celia" ? "Célia" : "Fernando"
    if (bairroAtual) renderLiderancas(bairroAtual)
    repaintMapa()
  })
})

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
    `<b>Zona:</b> ${getDistritoDoBairro(bairroNome)}`

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
    labels.innerHTML  = "<span>0</span><span>15k</span><span>80k</span><span>150k+</span>"
    steps.innerHTML   = `
      <div class="legenda-row"><div class="legenda-swatch" style="background:#084594;"></div><span>150.000+ <small>muito alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#2171b5;"></div><span>80.000–149.999 <small>alto</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#4292c6;"></div><span>40.000–79.999 <small>moderado</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#6baed6;"></div><span>15.000–39.999 <small>baixo</small></span></div>
      <div class="legenda-row"><div class="legenda-swatch" style="background:#c6dbef;"></div><span>1–14.999 <small>muito baixo</small></span></div>
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
window.iniciarMapa = function() {
  map = L.map('map').setView([-22.91, -43.17], 11)
  setTimeout(() => map.invalidateSize(), 200)

  fetch("geo/riobairros.geojson")
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

          // clique no bairro
          layer.on("click", () => selecionarBairro(bairro, layer))

          // label do bairro
          const center = layer.getBounds().getCenter()

          L.marker(center,{
            icon: L.divIcon({
              className: "bairro-label",
              html: bairro,
              iconSize: [120,20],
              iconAnchor: [60,10]
            })
          }).addTo(map)

        }

      }).addTo(map)

      // ajustar mapa aos bairros
      map.fitBounds(geoBairros.getBounds())

      // carregar dados do backend
      return carregarTudo()

    })
    .then(() => {
      repaintMapa()
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

document.getElementById('edit-salvar-btn').addEventListener('click', async () => {
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
})

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModalEditar()
})