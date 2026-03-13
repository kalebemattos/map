const BAIRRO_PROP = "NM_BAIRRO" // ajuste para o campo correto do seu GeoJSON

// =============================================================
// MAPA DE ANGRA DOS REIS – mapa.js
// =============================================================

// API_URL é definido pelo auth.js como window.API_URL

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
const map = L.map('map').setView([-22.91, -43.17], 11)

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
    const res  = await apiFetch('/liderancas')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(c => {
        const key = c.bairro || c.cidade
        initCache(key)
        dataCache[key].liderancas = c.liderancas || []
      })
    }
  } catch (e) { console.error('Erro lideranças:', e) }

  // Expectativas por bairro (separadas por campanha)
  try {
    const res  = await apiFetch('/expectativa-rjcapital-todas')
    const lista = await res.json()
    if (Array.isArray(lista)) {
      lista.forEach(e => {
        const key = e.bairro || e.cidade
        initCache(key)
        dataCache[key].expectativaCidade = {
          celia:    Number(e.expectativa_celia    || 0),
          fernando: Number(e.expectativa_fernando || 0)
        }
      })
    }
  } catch (e) { console.error('Erro expectativas:', e) }
}

function initCache(bairro) {
  if (!bairro) return
  if (!dataCache[bairro]) {
    dataCache[bairro] = {
      liderancas: [],
      expectativaCidade: { celia: 0, fernando: 0 }
    }
  }
}

function getCacheEntry(bairro) {
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

// ─────────────────────────────────────────────
// REPINTAR
// ─────────────────────────────────────────────
function repaintMapa() {
  if (!geoBairros) return
  geoBairros.eachLayer(layer => {
    const b = layer.feature.properties[BAIRRO_PROP]
    const v = getTotalExpectativa(b)
    layer.setStyle({
      color:       layer === layerSelecionado ? "#0f172a" : "#1e40af",
      weight:      layer === layerSelecionado ? 3.5 : 0.9,
      fillColor:   corPorExpectativa(v),
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
    const v = getTotalExpectativa(b)
    if (!distrito) {
      layer.setStyle({ color:"#1e40af", weight:0.9, fillColor:corPorExpectativa(v), fillOpacity:0.72 })
      return
    }
    if (d === distrito) {
      layer.setStyle({ color:"#0f172a", weight:2.5, fillColor:corPorExpectativa(v), fillOpacity:0.9 })
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
async function editarLideranca(l, bairro) {
  const novoNome    = prompt("Nome:", l.nome);           if (novoNome === null) return
  const novoContato = prompt("Contato:", l.contato || "")
  const novosVotos  = prompt("Expectativa de votos:", l.expectativa_votos ?? 0)
  const novoVinculo = prompt("Campanha (ambos / celia / fernando):", l.vinculo_politico || "ambos")

  try {
    await apiFetch(`/liderancas/${l.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nome:              novoNome,
        contato:           novoContato,
        expectativa_votos: Number(novosVotos) || 0,
        vinculo_politico:  ["ambos","celia","fernando"].includes(novoVinculo) ? novoVinculo : l.vinculo_politico
      })
    })
    await carregarTudo()
    repaintMapa()
    renderLiderancas(bairro)
  } catch (err) {
    console.error(err)
    alert('Erro ao salvar liderança')
  }
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
    formData.append('bairro',            bairroAtual)
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
      fillColor: corPorExpectativa(getTotalExpectativa(old)),
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
// GEOJSON — chamado pelo iniciarAplicacao() após login
// ─────────────────────────────────────────────
window.iniciarMapa = function() {
  // Força o Leaflet a recalcular o tamanho após content-wrapper ser revelado
  setTimeout(() => { if (map) map.invalidateSize() }, 100)

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

      // força recalculo do tamanho do mapa
      map.whenReady(() => {
        setTimeout(() => {
          map.invalidateSize()
        }, 400)
      })

    })
    .catch(err => {
      console.error("Erro ao inicializar mapa:", err)
    })

}