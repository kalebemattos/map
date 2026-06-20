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

// ─────────────────────────────────────────────
// VOTOS DE REFERÊNCIA 2022 por bairro (Célia) — seções somadas
// ─────────────────────────────────────────────
const VOTOS_REFERENCIA_2022 = {
  "ACARI": 2, "ÁGUA SANTA": 6, "ALTO DA BOA VISTA": 2, "ANCHIETA": 52,
  "ANDARAÍ": 27, "ANIL": 18, "AUGUSTO VASCONCELOS": 1, "BAIRRO DE FÁTIMA": 4,
  "BANCÁRIOS": 12, "BANGU": 67, "BARRA DA TIJUCA": 188, "BARRA DE GUARATIBA": 2,
  "BARROS FILHO": 6, "BENFICA": 20, "BENTO RIBEIRO": 8, "BONSUCESSO": 26,
  "BOTAFOGO": 72, "BRÁS DE PINA": 26, "CACHAMBI": 23, "CACUIA": 7,
  "CAJU": 3, "CAMORIM": 7, "CAMPINHO": 3, "CAMPO GRANDE": 103,
  "CASCADURA": 13, "CATETE": 31, "CATIRI": 4, "CAVALCANTI": 10,
  "CENTRO": 25, "CIDADE DE DEUS": 17, "CIDADE NOVA": 2, "COCOTÁ": 12,
  "COELHO NETO": 10, "COLÉGIO": 8, "COPACABANA": 20, "CORDOVIL": 35,
  "COSME VELHO": 2, "COSMOS": 17, "COSTA BARROS": 5, "CURICICA": 28,
  "DEL CASTILHO": 7, "DENDE": 0, "DEODORO": 26, "ENCANTADO": 3,
  "ENGENHEIRO LEAL": 3, "ENGENHO DA RAINHA": 18, "ENGENHO DE DENTRO": 30, "ENGENHO NOVO": 15,
  "ESTÁCIO": 6, "FLAMENGO": 40, "FREGUESIA (ILHA DO GOVERNADOR)": 8, "FREGUESIA JPA": 46,
  "FUNDÃO": 0, "GALEÃO": 19, "GAMBOA": 1, "GARDENIA AZUL": 5,
  "GÁVEA": 32, "GLÓRIA": 2, "GRAJAÚ": 28, "GUADALUPE": 14,
  "GUARABU": 0, "GUARATIBA": 20, "HIGIENÓPOLIS": 5, "HONÓRIO GURGEL": 19,
  "HUMAITA": 14, "ILHA DE GUARATIBA": 7, "INHAUMA": 14, "INHOAÍBA": 9,
  "IPANEMA": 74, "IRAJÁ": 33, "ITANHANGÁ": 12, "JACARÉ": 12,
  "JACAREPAGUÁ": 0, "JARDIM AMÉRICA": 15, "JARDIM BANGU": 6, "JARDIM BOTÂNICO": 19,
  "JARDIM GUANABARA": 18, "JARDIM SULACAP": 11, "LAGOA": 24, "LAPA": 3,
  "LARANJEIRAS": 39, "LEBLON": 95, "LEME": 9, "LINS DE VASCONCELOS": 7,
  "MADUREIRA": 14, "MAGALHÃES BASTOS": 15, "MANGUEIRA": 7, "MANGUINHOS": 0,
  "MARACANÃ": 23, "MARECHAL HERMES": 29, "MARIA DA GRAÇA": 7, "MEIER": 33,
  "MONERÓ": 7, "OLARIA": 27, "OSWALDO CRUZ": 9, "PACIÊNCIA": 36,
  "PADRE MIGUEL": 41, "PAQUETÁ": 1, "PARADA DE LUCAS": 18, "PARQUE ANCHIETA": 0,
  "PARQUE COLÚMBIA": 6, "PAVUNA": 23, "PECHINCHA": 24, "PEDRA DE GUARATIBA": 10,
  "PENHA": 29, "PENHA CIRCULAR": 29, "PIEDADE": 14, "PILARES": 10,
  "PITANGUEIRAS": 1, "PORTUGUESA": 8, "PRAÇA DA BANDEIRA": 13, "PRAÇA SECA": 22,
  "QUINTINO BOCAIUVA": 10, "RAMOS": 24, "REALENGO": 78, "RECREIO": 75,
  "RIACHUELO": 6, "RIBEIRA": 1, "RICARDO DE ALBUQUERQUE": 5, "RIO COMPRIDO": 43,
  "RIO DAS PEDRAS": 20, "ROCHA": 12, "ROCHA MIRANDA": 19, "ROCINHA": 1,
  "SANTA CRUZ": 18, "SANTA TERESA": 13, "SANTÍSSIMO": 22, "SANTO CRISTO": 1,
  "SÃO CONRADO": 40, "SÃO CRISTÓVÃO": 16, "SÃO FRANCISCO XAVIER": 0, "SÃO JORGE": 0,
  "SAUDE": 2, "SENADOR CAMARÁ": 26, "SENADOR VASCONCELOS": 7, "SEPETIBA": 16,
  "TANQUE": 24, "TAQUARA": 74, "TAUÁ": 5, "TIJUCA": 34,
  "TODOS OS SANTOS": 14, "TOMAS COELHO": 2, "TOMÁS COELHO": 2, "TRIAGEM": 11,
  "TUBIACANGA": 0, "TURIAÇÚ": 4, "URCA": 15, "VARGEM GRANDE": 8,
  "VARGEM PEQUENA": 6, "VASCO DA GAMA": 5, "VAZ LOBO": 5, "VICENTE DE CARVALHO": 2,
  "VIDIGAL": 8, "VIGÁRIO GERAL": 8, "VILA DA PENHA": 24, "VILA ISABEL": 34,
  "VILA KENNEDY": 13, "VILA KOSMOS": 10, "VILA MILITAR": 1, "VILA VALQUEIRE": 11,
  "VISTA ALEGRE": 5, "ZUMBI": 4
}

// helper: busca votos de referência normalizando o nome do bairro
function getVotosRef2022(bairro) {
  if (!bairro) return 0
  const n = normalizar(bairro)
  for (const k of Object.keys(VOTOS_REFERENCIA_2022)) {
    if (normalizar(k) === n) return VOTOS_REFERENCIA_2022[k]
  }
  return 0
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

const layersPorBairro = {}
let liderancasMapLayer   = null
let liderancasMapVisiveis = true

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

  // Se body for FormData, não definir Content-Type — o browser define
  // automaticamente com o boundary correto (multipart/form-data; boundary=...)
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

async function carregarConfig(tentativas = 3) {
  for (let i = 0; i < tentativas; i++) {
    try {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 800 * i))
        await tentarRefresh()
      }
      const token = localStorage.getItem('token')
      const r = await fetch(window.API_URL + '/config', {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      })
      if (!r.ok) continue
      configSistema = await r.json()
      if (configSistema.cores) {
        const c = typeof configSistema.cores === 'string'
          ? JSON.parse(configSistema.cores)
          : configSistema.cores
        if (c.primaria)   document.documentElement.style.setProperty('--blue-main', c.primaria)
        if (c.secundaria) document.documentElement.style.setProperty('--blue-deep', c.secundaria)
        if (c.destaque)   document.documentElement.style.setProperty('--blue-mid',  c.destaque)
      }
      injetarCandidatosRJ()
      return
    } catch (e) { console.warn(`[config] tentativa ${i + 1} falhou:`, e) }
  }
  console.warn('[config] não foi possível carregar após', tentativas, 'tentativas')
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

function injetarCandidatosRJ() {
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
        if (bairroAtual) renderDobradasSidebar(bairroAtual)
        repaintMapa()
        renderLiderancasNoMapa()
        renderDobradasNoMapa()
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

  // 4. Card de votos históricos 2022 por candidato
  const votosCardsEl = document.getElementById('bairro-votos-cards')
  if (votosCardsEl) {
    votosCardsEl.innerHTML = cands
      .filter(c => c.tem_votos_2022)
      .map(c => `
        <div id="votos-card-bairro-${c.chave}" class="sidebar-block" style="display:none;background:${c.cor_fundo};border:1.5px solid ${c.cor_texto}33;">
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="../img/${c.chave}.jpg" onerror="this.style.display='none'"
              style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ${c.cor_texto}44;flex-shrink:0;">
            <div>
              <div style="font-size:12px;font-weight:600;color:${c.cor_texto};opacity:.75;margin-bottom:2px;">Votação 2022 – ${c.nome}</div>
              <div id="votos-display-bairro-${c.chave}" style="font-family:'Sora',sans-serif;font-weight:800;color:${c.cor_texto};font-size:20px;">0 votos</div>
              <div id="votos-pct-bairro-${c.chave}" style="font-size:12px;color:${c.cor_texto};opacity:.7;margin-top:2px;"></div>
            </div>
          </div>
        </div>`
      ).join('')
  }

  // 5. Linhas por candidato no card de totais da zona (igual ao mapa do estado)
  const regiaoCandsEl = document.getElementById('regiao-cand-rows')
  if (regiaoCandsEl) {
    regiaoCandsEl.innerHTML = cands.map(c =>
      `${c.tem_votos_2022 ? `
      <div class="regiao-totais-row">
        <span class="regiao-totais-label"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="hi" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/></svg> Votos ${c.nome} (2022)</span>
        <span class="regiao-totais-val" id="regiao-votos-${c.chave}">0</span>
      </div>` : ''}
      <div class="regiao-totais-row">
        <span class="regiao-totais-label"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="hi" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z"/></svg> Meta ${c.nome}</span>
        <span class="regiao-totais-val" id="regiao-exp-${c.chave}">0</span>
      </div>
      <div class="regiao-totais-row">
        <span class="regiao-totais-label" style="color:rgba(255,255,255,0.75);"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" class="hi" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"/></svg> Exp. Lideranças ${c.nome}</span>
        <span class="regiao-totais-val" id="regiao-exp-lid-${c.chave}" style="color:#34d399;font-size:12px;">0</span>
      </div>`
    ).join('')
  }

  // Repintar mapa com as cores atualizadas do config
  repaintMapa()
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
        getCacheEntry(raw).expectativaCidade = Object.fromEntries(
          (configSistema.candidatos || []).map(c => [c.chave, Number(e['expectativa_' + c.chave] || 0)])
        )
      })
    }
  } catch (e) { console.error('Erro expectativas:', e) }

  // Carrega dobradas junto
  await carregarDobradas()

  // Atualiza painel de cobertura de bairros após carregar dados
  atualizarCoberturaBairros()
}

// ══════════════════════════════════════════════════════
// DOBRADAS
// ══════════════════════════════════════════════════════
let dobradasCache       = []
let dobradasMapLayer    = null
let dobradasMapVisiveis = false

function iniciarDobradasLayer() {
  if (!dobradasMapLayer) {
    dobradasMapLayer = L.layerGroup()
  }
}

async function carregarDobradas() {
  try {
    const res = await apiFetch('/dobradas')
    dobradasCache = await res.json()
    if (!Array.isArray(dobradasCache)) dobradasCache = []
  } catch (e) {
    console.error('Erro ao carregar dobradas:', e)
    dobradasCache = []
  }
}

function renderDobradasSidebar(bairro) {
  const container = document.getElementById('dobradas-container')
  const listEl    = document.getElementById('dobradas-list')
  const countEl   = document.getElementById('dobradas-count')
  if (!container || !listEl) return

  const cands = configSistema.candidatos || []
  const user  = JSON.parse(localStorage.getItem('user') || '{}')
  const podeEditar = user.nivel === 'dono' || user.nivel === 'admin'

  // Preenche select de candidatos no form (só uma vez)
  const sel = document.getElementById('dobrada-vinculo')
  if (sel && !sel.options.length) {
    cands.forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.chave; opt.textContent = c.nome
      sel.appendChild(opt)
    })
  }

  if (!bairro) { container.style.display = 'none'; return }

  container.style.display = ''

  // No form "Adicionar" hide when in Ambos mode
  const formEl = document.getElementById('add-dobrada-form')
  if (formEl) formEl.style.display = filtroCampanha === 'ambos' ? 'none' : ''

  const lista = filtroCampanha === 'ambos'
    ? dobradasCache.filter(d => d.cidade === bairro)
    : dobradasCache.filter(d => d.cidade === bairro && d.vinculo_politico === filtroCampanha)

  if (countEl) countEl.textContent = lista.length

  if (!lista.length) {
    listEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;margin:0;">Nenhuma dobrada cadastrada.</p>'
    return
  }

  listEl.innerHTML = lista.map(d => {
    const cand     = cands.find(c => c.chave === d.vinculo_politico)
    const cor      = cand ? (cand.cor_fundo || '#1565c0') : '#64748b'
    const candFoto = cand ? `../img/${cand.chave}.jpg` : ''
    const candNome = cand ? cand.nome : d.vinculo_politico
    const parcInicial = (d.parceiro_nome || '?')[0].toUpperCase()

    const parceiroSvg = `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="7" fill="${cor}22"/>
      <text x="18" y="24" text-anchor="middle" font-size="15" font-weight="800" font-family="DM Sans,sans-serif" fill="${cor}">${parcInicial}</text>
    </svg>`

    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <div style="width:36px;height:36px;border-radius:7px;border:2px solid ${cor};overflow:hidden;background:#f8fafc;">
          <img src="${candFoto}" onerror="this.style.display='none'" alt="" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="width:36px;height:36px;border-radius:7px;border:2px solid ${cor};overflow:hidden;background:#f8fafc;display:flex;align-items:center;justify-content:center;">
          ${d.parceiro_foto
            ? `<img src="${d.parceiro_foto}" onerror="this.outerHTML='${parceiroSvg}'" alt="" style="width:100%;height:100%;object-fit:cover;">`
            : parceiroSvg}
        </div>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:.4px;">${candNome}</div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.parceiro_nome}</div>
        ${d.parceiro_cargo ? `<div style="font-size:11px;color:#64748b;">${d.parceiro_cargo}</div>` : ''}
        ${d.responsavel ? `<div style="font-size:11px;color:#475569;">👤 Resp.: <b>${d.responsavel}</b></div>` : ''}
        ${d.votos_oferecidos ? `<div style="font-size:12px;color:#1565c0;font-weight:700;">${Number(d.votos_oferecidos).toLocaleString('pt-BR')} votos</div>` : ''}
      </div>
      ${podeEditar ? `
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
        <button onclick="abrirEditarDobrada(${d.id})" title="Editar"
                style="width:28px;height:28px;border:none;border-radius:6px;background:#dbeafe;color:#1565c0;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✏️</button>
        <button onclick="excluirDobrada(${d.id})" title="Excluir"
                style="width:28px;height:28px;border:none;border-radius:6px;background:#fee2e2;color:#dc2626;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>` : ''}
    </div>`
  }).join('')
}

async function excluirDobrada(id) {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel !== 'dono' && user.nivel !== 'admin') { alert('Acesso negado.'); return }
  if (!confirm('Excluir esta dobrada?')) return
  try {
    await apiFetch(`/dobradas/${id}`, { method: 'DELETE' })
    await carregarDobradas()
    renderDobradasSidebar(bairroAtual)
    renderDobradasNoMapa()
    atualizarCoberturaBairros()
  } catch (e) { alert('Erro ao excluir dobrada') }
}

function abrirEditarDobrada(id) {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.nivel !== 'dono' && user.nivel !== 'admin') { alert('Acesso negado.'); return }
  const d = dobradasCache.find(x => x.id === id)
  if (!d) return

  const cands = configSistema.candidatos || []
  const sel = document.getElementById('edit-dobrada-vinculo')
  sel.innerHTML = ''
  cands.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.chave; opt.textContent = c.nome
    if (c.chave === d.vinculo_politico) opt.selected = true
    sel.appendChild(opt)
  })

  document.getElementById('edit-dobrada-id').value               = d.id
  document.getElementById('edit-dobrada-parceiro-nome').value    = d.parceiro_nome || ''
  document.getElementById('edit-dobrada-responsavel').value      = d.responsavel   || ''
  document.getElementById('edit-dobrada-parceiro-cargo').value   = d.parceiro_cargo || ''
  document.getElementById('edit-dobrada-votos').value            = d.votos_oferecidos || ''
  document.getElementById('edit-dobrada-votos-candidato').value  = d.votos_candidato  || ''

  const circle = document.getElementById('edit-dobrada-foto-circle')
  if (d.parceiro_foto) {
    circle.innerHTML = ''
    circle.style.backgroundImage = `url(${d.parceiro_foto})`
  } else {
    circle.innerHTML = '👤'
    circle.style.backgroundImage = ''
  }
  document.getElementById('edit-dobrada-foto-input').value = ''
  document.getElementById('modal-dobrada-editar').style.display = 'flex'
}

function fecharModalDobrada() {
  document.getElementById('modal-dobrada-editar').style.display = 'none'
}

document.addEventListener('change', function(e) {
  if (e.target.id === 'edit-dobrada-foto-input') {
    const file = e.target.files[0]
    const circle = document.getElementById('edit-dobrada-foto-circle')
    if (!file || !circle) return
    const reader = new FileReader()
    reader.onload = ev => {
      circle.innerHTML = ''
      circle.style.backgroundImage = 'url(' + ev.target.result + ')'
      circle.style.backgroundSize = 'cover'
      circle.style.backgroundPosition = 'center'
    }
    reader.readAsDataURL(file)
  }
  if (e.target.id === 'dobrada-foto-input') {
    const file = e.target.files[0]
    const circle = document.getElementById('dobrada-foto-circle')
    if (!file || !circle) return
    const reader = new FileReader()
    reader.onload = ev => {
      circle.innerHTML = ''
      circle.style.backgroundImage = 'url(' + ev.target.result + ')'
      circle.style.backgroundSize = 'cover'
      circle.style.backgroundPosition = 'center'
    }
    reader.readAsDataURL(file)
  }
})

async function salvarEdicaoDobrada() {
  const id             = document.getElementById('edit-dobrada-id').value
  const vinculo        = document.getElementById('edit-dobrada-vinculo').value
  const parceiroNome   = document.getElementById('edit-dobrada-parceiro-nome').value.trim()
  const responsavel    = document.getElementById('edit-dobrada-responsavel').value.trim()
  const parceiroCargo  = document.getElementById('edit-dobrada-parceiro-cargo').value.trim()
  const votos          = document.getElementById('edit-dobrada-votos').value
  const votosCandidato = document.getElementById('edit-dobrada-votos-candidato').value
  const fotoInput      = document.getElementById('edit-dobrada-foto-input')

  if (!parceiroNome) { alert('Informe o nome do parceiro.'); return }

  const btn = document.getElementById('edit-dobrada-salvar')
  btn.disabled = true; btn.textContent = 'Salvando…'

  try {
    const fd = new FormData()
    fd.append('vinculo_politico', vinculo)
    fd.append('parceiro_nome',    parceiroNome)
    fd.append('responsavel',      responsavel)
    fd.append('parceiro_cargo',   parceiroCargo)
    fd.append('votos_oferecidos', String(Number(votos) || 0))
    fd.append('votos_candidato',  String(Number(votosCandidato) || 0))
    if (fotoInput.files[0]) fd.append('foto', fotoInput.files[0])

    const token = localStorage.getItem('token')
    await fetch(`${window.API_URL}/dobradas/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    })

    fecharModalDobrada()
    await carregarDobradas()
    renderDobradasSidebar(bairroAtual)
    renderDobradasNoMapa()
    atualizarCoberturaBairros()
  } catch (e) {
    alert('Erro ao salvar dobrada.')
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar alterações'
  }
}

function criarIconeDobrada(d) {
  const cands = configSistema.candidatos || []
  const cand  = cands.find(c => c.chave === d.vinculo_politico)
  const cor   = cand ? (cand.cor_fundo || '#1565c0') : '#64748b'
  const candFoto    = cand ? `../img/${cand.chave}.jpg` : ''
  const candInicial = (cand ? cand.nome : 'C')[0].toUpperCase()
  const parcInicial = (d.parceiro_nome || '?')[0].toUpperCase()

  const SZ = 24, GAP = 3, W = SZ * 2 + GAP, H = SZ
  const uid1 = `db1_${d.id}`, uid2 = `db2_${d.id}`

  const svg = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
      <defs>
        <clipPath id="${uid1}"><rect x="0"         y="0" width="${SZ}" height="${SZ}" rx="5"/></clipPath>
        <clipPath id="${uid2}"><rect x="${SZ+GAP}" y="0" width="${SZ}" height="${SZ}" rx="5"/></clipPath>
      </defs>
      <rect x="0" y="0" width="${SZ}" height="${SZ}" rx="5" fill="white" stroke="${cor}" stroke-width="2"/>
      ${candFoto
        ? `<image href="${candFoto}" x="0" y="0" width="${SZ}" height="${SZ}" clip-path="url(#${uid1})" preserveAspectRatio="xMidYMid slice"/>`
        : `<text x="${SZ/2}" y="${SZ/2+4}" text-anchor="middle" font-size="11" font-weight="800" font-family="DM Sans,sans-serif" fill="${cor}">${candInicial}</text>`}
      <rect x="0" y="0" width="${SZ}" height="${SZ}" rx="5" fill="none" stroke="${cor}" stroke-width="2"/>
      <rect x="${SZ+GAP}" y="0" width="${SZ}" height="${SZ}" rx="5" fill="white" stroke="${cor}" stroke-width="2"/>
      ${d.parceiro_foto
        ? `<image href="${d.parceiro_foto}" x="${SZ+GAP}" y="0" width="${SZ}" height="${SZ}" clip-path="url(#${uid2})" preserveAspectRatio="xMidYMid slice"/>`
        : `<text x="${SZ+GAP+SZ/2}" y="${SZ/2+4}" text-anchor="middle" font-size="11" font-weight="800" font-family="DM Sans,sans-serif" fill="${cor}">${parcInicial}</text>`}
      <rect x="${SZ+GAP}" y="0" width="${SZ}" height="${SZ}" rx="5" fill="none" stroke="${cor}" stroke-width="2"/>
    </svg>`

  return L.divIcon({
    className: '',
    html: svg,
    iconSize:   [W, H],
    iconAnchor: [W / 2, H],
    popupAnchor:[0, -(H + 4)]
  })
}

function renderDobradasNoMapa() {
  if (!dobradasMapLayer) return
  dobradasMapLayer.clearLayers()
  if (!dobradasMapVisiveis || filtroCampanha === 'ambos') return

  const cands = configSistema.candidatos || []

  dobradasCache.forEach(d => {
    if (d.vinculo_politico !== filtroCampanha) return

    const bairroLayer = layersPorBairro[d.cidade]
    if (!bairroLayer) return
    const centroide = bairroLayer.getBounds().getCenter()

    const seed = typeof d.id === 'number' ? d.id : String(d.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const jLat = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5
    const jLng = ((seed * 7927 + 13849) % 233280) / 233280 - 0.5
    const lat  = centroide.lat + jLat * 0.004
    const lng  = centroide.lng + jLng * 0.004

    const marker = L.marker([lat, lng], { icon: criarIconeDobrada(d), zIndexOffset: 950 })

    const cand = cands.find(c => c.chave === d.vinculo_politico)
    const cor  = cand?.cor_fundo || '#1565c0'
    marker.bindTooltip(
      `<div style="font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.4;">
         <b style="color:${cor}">${cand?.nome || d.vinculo_politico}</b> + <b>${d.parceiro_nome}</b>
         ${d.parceiro_cargo ? `<br><span style="color:#64748b">${d.parceiro_cargo}</span>` : ''}
         ${d.responsavel ? `<br><span style="color:#475569">👤 ${d.responsavel}</span>` : ''}
         ${d.votos_oferecidos ? `<br><span style="color:#1565c0;font-weight:700">${Number(d.votos_oferecidos).toLocaleString('pt-BR')} votos</span>` : ''}
         <br><span style="color:#94a3b8;font-size:10px">${d.cidade}</span>
       </div>`,
      { permanent: false, direction: 'top', offset: [0, -4] }
    )
    dobradasMapLayer.addLayer(marker)
  })
}

// Toggle button dobradas
document.addEventListener('DOMContentLoaded', () => {
  const btnDob = document.getElementById('toggleDobradasPins')
  if (btnDob) {
    btnDob.onclick = () => {
      dobradasMapVisiveis = !dobradasMapVisiveis
      if (dobradasMapVisiveis) {
        if (dobradasMapLayer) { dobradasMapLayer.addTo(window.map); renderDobradasNoMapa() }
        btnDob.textContent = 'ON'; btnDob.classList.add('ctrl-pin-ativo')
      } else {
        if (dobradasMapLayer) window.map.removeLayer(dobradasMapLayer)
        btnDob.textContent = 'OFF'; btnDob.classList.remove('ctrl-pin-ativo')
      }
    }
  }

  // Form: adicionar dobrada
  const btnAdd = document.getElementById('add-dobrada')
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      if (user.nivel === 'visualizador') { alert('Acesso negado.'); return }
      if (!bairroAtual) { alert('Selecione um bairro primeiro.'); return }

      const vinculo       = document.getElementById('dobrada-vinculo').value
      const parceiroNome  = document.getElementById('dobrada-parceiro-nome').value.trim()
      const responsavel   = document.getElementById('dobrada-responsavel').value.trim()
      const parceiroCargo = document.getElementById('dobrada-parceiro-cargo').value.trim()
      const votos         = document.getElementById('dobrada-votos').value
      const fotoInput     = document.getElementById('dobrada-foto-input')

      if (!parceiroNome) { alert('Informe o nome do parceiro.'); return }

      btnAdd.disabled = true; btnAdd.textContent = 'Salvando…'

      try {
        const fd = new FormData()
        fd.append('cidade',           bairroAtual)
        fd.append('vinculo_politico', vinculo)
        fd.append('parceiro_nome',    parceiroNome)
        fd.append('responsavel',      responsavel)
        fd.append('parceiro_cargo',   parceiroCargo)
        fd.append('votos_oferecidos', String(Number(votos) || 0))
        if (fotoInput.files[0]) fd.append('foto', fotoInput.files[0])

        const token = localStorage.getItem('token')
        await fetch(`${window.API_URL}/dobradas`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        })

        // Limpar form
        document.getElementById('dobrada-parceiro-nome').value  = ''
        document.getElementById('dobrada-responsavel').value    = ''
        document.getElementById('dobrada-parceiro-cargo').value = ''
        document.getElementById('dobrada-votos').value          = ''
        fotoInput.value = ''
        const circle = document.getElementById('dobrada-foto-circle')
        circle.innerHTML = '👤'; circle.style.backgroundImage = ''

        await carregarDobradas()
        renderDobradasSidebar(bairroAtual)
        renderDobradasNoMapa()
        atualizarCoberturaBairros()
      } catch (e) {
        alert('Erro ao adicionar dobrada.')
      } finally {
        btnAdd.disabled = false; btnAdd.textContent = '+ Adicionar Dobrada'
      }
    })
  }
})

window.abrirEditarDobrada  = abrirEditarDobrada
window.fecharModalDobrada  = fecharModalDobrada
window.salvarEdicaoDobrada = salvarEdicaoDobrada
window.excluirDobrada      = excluirDobrada
window.renderDobradasNoMapa = renderDobradasNoMapa

// ─────────────────────────────────────────────
// PAINEL COBERTURA DE BAIRROS
// ─────────────────────────────────────────────
function atualizarCoberturaBairros() {
  const painel = document.getElementById('cobertura-bairros')
  if (!painel) return

  // Total de bairros a partir de distritos.js
  let total = 0
  const todosBairros = []
  Object.values(distritos || {}).forEach(d => {
    ;(d.bairros || []).forEach(b => {
      todosBairros.push(b)
      total++
    })
  })
  if (total === 0) return

  // Bairros com pelo menos 1 liderança OU 1 dobrada
  const normB = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
  const comCoberturaNorm = new Set()

  Object.keys(dataCache).forEach(bairro => {
    const lids = dataCache[bairro]?.liderancas || []
    if (lids.length > 0) comCoberturaNorm.add(normB(bairro))
  });
  (dobradasCache || []).forEach(d => {
    if (d.cidade) comCoberturaNorm.add(normB(d.cidade))
  })

  const comCobertura = todosBairros.filter(b => comCoberturaNorm.has(normB(b))).length
  const semCobertura = total - comCobertura

  const elCom   = document.getElementById('cob-com')
  const elSem   = document.getElementById('cob-sem')
  const elTotal = document.getElementById('cob-total')
  if (elCom)   elCom.textContent   = comCobertura
  if (elSem)   elSem.textContent   = semCobertura
  if (elTotal) elTotal.textContent = total

  painel.style.display = 'block'
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
  calcularTotalGeral()
  atualizarLegenda()
  if (window.GeoMode && window.GeoMode.isAtivo()) { window.GeoMode.syncStyles(); return }
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    layer.setStyle({
      color:       layer === layerSelecionado ? "#0f172a" : "#1e40af",
      weight:      layer === layerSelecionado ? 3.5 : 0.9,
      fillColor:   getCorModo(b),
      fillOpacity: layer === layerSelecionado ? 0.92 : 0.72
    })
  })
}

// ─────────────────────────────────────────────
// FILTRAR DISTRITO
// ─────────────────────────────────────────────
function filtrarDistrito(distrito) {
  if (!geoBairros) return
  if (window.GeoMode && window.GeoMode.isAtivo()) { window.GeoMode.filtrarGeo(distrito); return }
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
// LÍDERES DE ZONA — carregados da Gestão de Acessos
// ─────────────────────────────────────────────
let lideresZona = {}

async function carregarLideresZona() {
  try {
    const res = await apiFetch('/lideres-regiao')
    if (!res.ok) return
    const lista = await res.json()
    lideresZona = {}
    lista.forEach(u => {
      if (!u.regiao_vinculada) return
      const chave = u.regiao_vinculada.trim().toUpperCase()
      if (!lideresZona[chave]) lideresZona[chave] = []
      lideresZona[chave].push({
        nome:     u.nome || u.usuario || '—',
        contato:  u.contato || '',
        foto_url: u.foto_url || null
      })
    })
  } catch (e) { console.warn('[lideres-zona] Não carregado:', e) }
}

// ─────────────────────────────────────────────
// LÍDER DO DISTRITO
// ─────────────────────────────────────────────
function mostrarLiderDistrito(distrito) {
  const card  = document.getElementById("lider-distrito-card")
  const lista = document.getElementById("lista-lideres-distrito")
  if (!distrito) { card.style.display = "none"; return }

  const chave = distrito.trim().toUpperCase()

  // Prioridade 1: dados ao vivo da Gestão de Acessos
  let lideres = lideresZona[chave] || null

  // Prioridade 2: fallback no distritos.js
  if (!lideres || lideres.length === 0) {
    const entry = distritos[distrito] || distritos[chave]
    if (entry && entry.lideres && entry.lideres.length) {
      lideres = entry.lideres.map(l => ({
        nome:     l.nome,
        contato:  l.telefone || '',
        foto_url: l.foto || null
      }))
    }
  }

  if (!lideres || lideres.length === 0) { card.style.display = "none"; return }

  card.style.display = "block"
  lista.innerHTML = ""

  lideres.forEach(lider => {
    const div = document.createElement("div")
    div.className = "lider-card"

    let fotoSrc = 'img/lideres/semfoto.jpg'
    if (lider.foto_url) {
      fotoSrc = lider.foto_url.startsWith('http')
        ? lider.foto_url
        : (window.API_URL ? window.API_URL.replace(/\/api$/, '') : '') + lider.foto_url
    }

    div.innerHTML = `
      <img src="${fotoSrc}" onerror="this.src='img/lideres/semfoto.jpg'" alt="">
      <div class="lider-info"><b>${lider.nome}</b><br><span>${lider.contato || ""}</span></div>
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

  // ── Atualiza card de votos históricos 2022 ──
  ;(configSistema.candidatos || []).filter(c => c.tem_votos_2022).forEach(c => {
    const card    = document.getElementById('votos-card-bairro-' + c.chave)
    const display = document.getElementById('votos-display-bairro-' + c.chave)
    const pct     = document.getElementById('votos-pct-bairro-' + c.chave)
    if (!card) return
    if (!bairro) { card.style.display = 'none'; return }
    const votos = getVotosRef2022(bairro)
    const n = normalizar(bairro)
    const total = (() => { for (const k of Object.keys(VOTOS_VALIDOS)) { if (normalizar(k) === n) return VOTOS_VALIDOS[k] } return 0 })()
    card.style.display = 'block'
    if (display) display.textContent = votos.toLocaleString('pt-BR') + ' votos'
    if (pct) pct.textContent = total > 0 ? (votos / total * 100).toFixed(1) + '% dos votos válidos' : ''
  })

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
// MODAL DETALHE (mesmo layout do mapa estadual)
// ─────────────────────────────────────────────
function abrirModalLideranca(l, bairro) {
  const div      = document.getElementById('modal-lideranca-conteudo')
  const bairroRef = bairro || bairroAtual || '—'
  const distrito  = getDistritoDoBairro(bairroRef)
  const _badge    = getBadge(l.vinculo_politico)
  const badgeClass = _badge.cls
  const badgeStyle = _badge.style
  const badgeLabel = (configSistema.candidatos || []).find(c => c.chave === l.vinculo_politico)?.nome || _badge.label
  const user       = JSON.parse(localStorage.getItem('user') || '{}')
  const podeEditar = user.nivel !== 'visualizador'

  window._modalLiderancaData = { l, bairro: bairroRef }

  div.innerHTML = `
    <div class="modal-conteudo-header">
      ${l.foto
        ? `<div class="modal-foto"><img src="${l.foto}" alt="Foto da liderança" onerror="this.parentElement.classList.add('sem-foto');this.remove()"></div>`
        : `<div class="modal-foto sem-foto">👤</div>`}
      <div>
        <h2 class="modal-nome">${l.nome || '—'}</h2>
        <div class="modal-sub">${bairroRef} · ${distrito}</div>
      </div>
    </div>

    <div class="modal-grid">
      <div>
        <strong>Contato</strong><br>
        ${l.contato || '—'}
      </div>
      <div>
        <strong>Expectativa de votos</strong><br>
        ${(l.expectativa_votos ?? 0).toLocaleString('pt-BR')}
      </div>
      <div>
        <strong>Campanha</strong><br>
        <span class="lideranca-vinculo-badge ${badgeClass}" style="${badgeStyle}">${badgeLabel}</span>
      </div>
      <div>
        <strong>Status</strong><br>
        ${l.status || 'ativa'}
      </div>
    </div>

    ${l.release ? `
    <div class="modal-release">
      <strong>Release / Observações</strong><br><br>
      ${l.release}
    </div>` : ''}

    ${podeEditar ? `
    <div class="modal-actions">
      <button id="modal-btn-editar" style="border:1.5px solid var(--slate-200);background:white;color:var(--slate-700);">✏️ Editar</button>
      <button id="modal-btn-excluir" style="border:1.5px solid #fee2e2;background:#fee2e2;color:#dc2626;">🗑️ Excluir</button>
    </div>` : ''}
  `

  if (podeEditar) {
    document.getElementById('modal-btn-editar').addEventListener('click', () => {
      fecharModalLideranca()
      const d = window._modalLiderancaData
      editarLideranca(d.l, d.bairro)
    })
    document.getElementById('modal-btn-excluir').addEventListener('click', () => {
      fecharModalLideranca()
      const d = window._modalLiderancaData
      excluirLideranca(d.l, d.bairro)
    })
  }

  document.getElementById('modal-lideranca').style.display = 'flex'
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
    renderLiderancasNoMapa()
    renderDobradasNoMapa()
    renderLiderancas(bairro)
    renderDobradasSidebar(bairro)
  } catch (err) {
    console.error(err)
    alert('Erro ao excluir liderança')
  }
}

// ─────────────────────────────────────────────
// HELPER — resolve a chave de região para uma cidade-mãe
// ─────────────────────────────────────────────
function getRegiaoParaCidade(cidadeMae) {
  for (const r of (configSistema.regioes || [])) {
    let cidades = r.cidades
    if (typeof cidades === 'string') { try { cidades = JSON.parse(cidades) } catch { cidades = [] } }
    if (Array.isArray(cidades) &&
        cidades.some(c => (c || '').toLowerCase().trim() === (cidadeMae || '').toLowerCase().trim()))
      return r.chave
  }
  return null
}

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

  if (!nome) { alert("Informe o nome da liderança."); return }

  // Se bairro selecionado → vai ao submapa RJ Capital; caso contrário → mapa estadual (Rio de Janeiro)
  const cidadeDestino = bairroAtual || 'Rio de Janeiro'
  const mapaDestino   = bairroAtual ? 'rjcapital' : null

  try {
    const formData = new FormData()
    formData.append('cidade',            cidadeDestino)
    if (mapaDestino) formData.append('mapa', mapaDestino)
    formData.append('nome',              nome)
    formData.append('contato',           contato)
    formData.append('vinculo_politico',  vinculo)
    formData.append('expectativa_votos', votos)

    // Resolve a região com base na cidade-mãe do submapa (necessário para o backend aceitar o POST)
    // "Rio de Janeiro" → chave da região no tenant (ex: "metropolitana")
    const regiao = getRegiaoParaCidade('Rio de Janeiro')
    if (regiao) formData.append('regiao', regiao)

    // Foto opcional
    const fotoFile = document.getElementById('lideranca-foto-input')?.files[0]
    if (fotoFile) formData.append('foto', fotoFile)

    const resp = await apiFetch('/liderancas', {
      method: 'POST',
      body: formData
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      alert('Erro ao salvar: ' + (err.error || resp.status))
      return
    }

    document.getElementById("lideranca-nome").value    = ""
    document.getElementById("lideranca-contato").value = ""
    document.getElementById("lideranca-votos").value   = "0"
    // Limpa preview da foto
    const fotoInput  = document.getElementById('lideranca-foto-input')
    const fotoCircle = document.getElementById('foto-picker-circle')
    if (fotoInput)  fotoInput.value = ''
    if (fotoCircle) fotoCircle.innerHTML = '👤'

    await carregarTudo()
    repaintMapa()
    renderLiderancasNoMapa()
    renderDobradasNoMapa()
    if (bairroAtual) renderLiderancas(bairroAtual)
    if (bairroAtual) renderDobradasSidebar(bairroAtual)
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
    await apiFetch('/expectativa-rjcapital', {
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

// Seletor de campanha: listeners registrados dinamicamente por injetarCandidatosRJ()

// ─────────────────────────────────────────────
// SELECIONAR BAIRRO
// ─────────────────────────────────────────────
function selecionarBairro(bairroNome, layer) {
  if (window.GeoMode && window.GeoMode.isAtivo()) {
    window._rjLayerSelecionado = layer
    window.GeoMode.selecionarDistrito(layer)
  }
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
  if (!(window.GeoMode && window.GeoMode.isAtivo())) {
    layer.setStyle({ weight: 3.5, color: "#0f172a", fillOpacity: 0.92 })
  }

  document.getElementById("bairro-nome").textContent = bairroNome
  document.getElementById("bairro-info").innerHTML =
    `<b>Zona:</b> ${getDistritoDoBairro(bairroNome)}`

  renderLiderancas(bairroNome)
  renderDobradasSidebar(bairroNome)
}

// ─────────────────────────────────────────────
// TOTAIS DA ZONA (mesmo design e lógica do mapa do estado)
// ─────────────────────────────────────────────
function mostrarResumoDistrito(zona) {
  const card      = document.getElementById('regiao-totais-card')
  const blockWrap = document.getElementById('block-totais-distrito')
  if (!card) return

  if (!zona) {
    card.style.display  = 'none'
    if (blockWrap) blockWrap.style.display = 'none'
    return
  }

  const bairrosZona = (distritos[zona]?.bairros || [])
  const cands       = configSistema.candidatos || []

  const porCand = {}
  cands.forEach(c => { porCand[c.chave] = { votos: 0, expCid: 0, expLid: 0 } })
  let totalVotos = 0

  bairrosZona.forEach(b => {
    const bNorm = normalizar(b)

    for (const k of Object.keys(VOTOS_VALIDOS)) {
      if (normalizar(k) === bNorm) { totalVotos += VOTOS_VALIDOS[k]; break }
    }

    cands.filter(c => c.tem_votos_2022).forEach(c => {
      for (const k of Object.keys(VOTOS_REFERENCIA_2022)) {
        if (normalizar(k) === bNorm) { porCand[c.chave].votos += VOTOS_REFERENCIA_2022[k]; break }
      }
    })

    const cd = getCacheEntry(b)
    cands.forEach(c => {
      porCand[c.chave].expCid += Number(cd.expectativaCidade?.[c.chave] || 0)
    })
    ;(cd.liderancas || []).forEach(l => {
      const vp   = l.vinculo_politico
      const voto = Number(l.expectativa_votos || 0)
      if (vp === 'ambos') {
        cands.forEach(c => { porCand[c.chave].expLid += voto / cands.length })
      } else if (porCand[vp] !== undefined) {
        porCand[vp].expLid += voto
      }
    })
  })

  const totalExpCid = cands.reduce((s, c) => s + porCand[c.chave].expCid, 0)
  const totalExpLid = cands.reduce((s, c) => s + porCand[c.chave].expLid, 0)
  const cobertura   = totalExpCid > 0 ? Math.round((totalExpLid / totalExpCid) * 100) : 0
  const corCob      = cobertura >= 80 ? '#34d399' : cobertura >= 50 ? '#fbbf24' : '#f87171'
  const fmt = n => Math.round(n).toLocaleString('pt-BR')

  document.getElementById('regiao-totais-nome').textContent =
    zona + ' · ' + bairrosZona.length + ' bairros'
  document.getElementById('regiao-total-votos').textContent = fmt(totalVotos)

  cands.forEach(c => {
    const elVotos  = document.getElementById('regiao-votos-'    + c.chave)
    const elExpCid = document.getElementById('regiao-exp-'      + c.chave)
    const elExpLid = document.getElementById('regiao-exp-lid-'  + c.chave)
    if (elVotos)  elVotos.textContent  = fmt(porCand[c.chave].votos)
    if (elExpCid) elExpCid.textContent = fmt(porCand[c.chave].expCid)
    if (elExpLid) elExpLid.textContent = fmt(porCand[c.chave].expLid)
  })

  const elTotalCid = document.getElementById('regiao-exp-total-cid')
  const elTotalLid = document.getElementById('regiao-exp-total-lid')
  const elCob      = document.getElementById('regiao-cobertura')
  if (elTotalCid) elTotalCid.textContent = fmt(totalExpCid)
  if (elTotalLid) elTotalLid.textContent = fmt(totalExpLid)
  if (elCob)      { elCob.textContent = cobertura + '%'; elCob.style.color = corCob }

  card.style.display  = 'block'
  if (blockWrap) blockWrap.style.display = 'block'
}

// ─────────────────────────────────────────────
// SELETOR DISTRITO
// ─────────────────────────────────────────────
document.getElementById("select-distrito").addEventListener("change", e => {
  filtrarDistrito(e.target.value)
  mostrarLiderDistrito(e.target.value)
  mostrarResumoDistrito(e.target.value)
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
// GEOJSON — chamado pelo iniciarAplicacao() após login
// ─────────────────────────────────────────────
window.iniciarMapa = async function() {
  await carregarLideresZona()
  await carregarConfig()
  map = L.map('map', { minZoom: 9, maxZoom: 18 }).setView([-22.91, -43.17], 11)
  window.map = map   // expõe para index.html (pins, invalidateSize, etc.)
  liderancasMapLayer = L.layerGroup().addTo(map)
  iniciarDobradasLayer()
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
          if (bairro) layersPorBairro[bairro] = layer

          // clique no bairro (intercepta modo adicionar pin antes de selecionar)
          layer.on("click", (e) => {
            if (window.modoAdicionarPin) {
              window.modoAdicionarPin = false
              if (typeof window.syncBotoesPins === 'function') window.syncBotoesPins()
              window.novoPinLatLng  = e.latlng
              window.novoPinCidade  = bairro
              if (typeof window.abrirModalPin === 'function') window.abrirModalPin()
              return
            }
            selecionarBairro(bairro, layer)
          })

          // label do bairro (não interativo — não deve interceptar cliques no polígono)
          const center = layer.getBounds().getCenter()

          L.marker(center,{
            icon: L.divIcon({
              className: "bairro-label",
              html: bairro,
              iconSize: [120,20],
              iconAnchor: [60,10]
            }),
            interactive: false,
            keyboard: false
          }).addTo(map)

        }

      }).addTo(map)

      // ajustar mapa aos bairros e travar zoom/panning
      map.fitBounds(geoBairros.getBounds(), { padding: [20, 20] })
      map.setMinZoom(Math.max(map.getZoom() - 1, 9))
      map.setMaxBounds(geoBairros.getBounds().pad(0.5))

      // carregar dados do backend
      return carregarTudo()

    })
    .then(() => {
      repaintMapa()
      renderLiderancasNoMapa()
      // Se o usuário é lider_zona_rj, aplica o filtro da sua zona
      if (window._zonaFixa) {
        filtrarDistrito(window._zonaFixa)
        mostrarLiderDistrito(window._zonaFixa)
        mostrarResumoDistrito(window._zonaFixa)
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
    renderLiderancasNoMapa()
    renderDobradasNoMapa()
    renderLiderancas(bairroAtual)
    renderDobradasSidebar(bairroAtual)
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

// ─────────────────────────────────────────────
// PINS DE LIDERANÇA NO MAPA
// ─────────────────────────────────────────────
function criarIconeLideranca(l) {
  const cands = configSistema.candidatos || []
  const cand  = cands.find(c => c.chave === l.vinculo_politico)
  const cor   = cand ? (cand.cor_fundo || '#1565c0') : '#64748b'
  const bgHex = cand ? (cand.cor_fundo || '#1565c0') : '#94a3b8'
  const uid   = 'lc' + String(l.id).replace(/\W/g, '')
  const inicial = (l.nome || '?')[0].toUpperCase()

  const fotoLayer = l.foto
    ? `<image href="${l.foto}" x="7" y="5" width="20" height="20"
           clip-path="url(#${uid})" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="17" cy="15" r="10" fill="${bgHex}22"/>
       <text x="17" y="19" text-anchor="middle" font-size="9" font-weight="800"
             font-family="DM Sans,sans-serif" fill="${cor}">${inicial}</text>`

  const svg = `
    <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"
         style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <defs>
        <clipPath id="${uid}">
          <circle cx="17" cy="15" r="10"/>
        </clipPath>
      </defs>
      <path d="M17 1C8.716 1 2 7.716 2 16C2 26.5 17 43 17 43C17 43 32 26.5 32 16C32 7.716 25.284 1 17 1Z"
            fill="white" stroke="${cor}" stroke-width="2.5"/>
      ${fotoLayer}
      <circle cx="17" cy="15" r="10" fill="none" stroke="${cor}" stroke-width="2"/>
    </svg>`

  return L.divIcon({
    className: '',
    html: svg,
    iconSize:   [34, 44],
    iconAnchor: [17, 43],
    popupAnchor:[0, -44]
  })
}

function renderLiderancasNoMapa() {
  if (!liderancasMapLayer) return
  liderancasMapLayer.clearLayers()
  if (!liderancasMapVisiveis) return
  Object.entries(dataCache).forEach(([bairro, bairroData]) => {
    if (!Array.isArray(bairroData.liderancas)) return
    const bairroLayer = layersPorBairro[bairro]
    const centroide = bairroLayer ? bairroLayer.getBounds().getCenter() : null
    bairroData.liderancas.forEach(l => {
      if (l.status === 'inativa') return
      let lat, lng
      if (l.lat && l.lng) {
        lat = l.lat; lng = l.lng
      } else if (centroide) {
        const seed = (typeof l.id === 'number' ? l.id : String(l.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0))
        const jLat = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5
        const jLng = ((seed * 7927 + 13849) % 233280) / 233280 - 0.5
        lat = centroide.lat + jLat * 0.005
        lng = centroide.lng + jLng * 0.005
      } else { return }
      if (filtroCampanha !== 'ambos' && l.vinculo_politico !== filtroCampanha && l.vinculo_politico !== 'ambos') return
      const marker = L.marker([lat, lng], {
        icon: criarIconeLideranca(l),
        zIndexOffset: 1000
      })
      liderancasMapLayer.addLayer(marker)
    })
  })
}

// ── Exposição de globais para GeoMode ──────────────────────────────────────
window.repaintMapa      = repaintMapa
window.renderLiderancas = renderLiderancas
window.renderLiderancasNoMapa = renderLiderancasNoMapa
window.toggleLiderancasMapLayer = function(visible) {
  liderancasMapVisiveis = visible
  if (liderancasMapLayer) {
    if (visible) { liderancasMapLayer.addTo(map); renderLiderancasNoMapa() }
    else map.removeLayer(liderancasMapLayer)
  }
}
Object.defineProperty(window, 'bairroAtual', {
  get: () => bairroAtual,
  set: v => { bairroAtual = v },
  configurable: true
})