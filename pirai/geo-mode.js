// ═══════════════════════════════════════════════════════════════════════════
// GEO-MODE.JS  —  Modo Geográfico  •  Piraí-RJ
//
// Camada COMPLEMENTAR ao Modo Estratégico existente.
// Não remove nem altera a lógica original — apenas se sobrepõe quando ativo.
//
// API pública (window.GeoMode):
//   .ativar()              — liga o modo geográfico
//   .desativar()           — desliga e restaura o modo estratégico
//   .isAtivo()             — boolean
//   .syncStyles()          — reaplica estilos geo a todos os distritos
//   .filtrarGeo(distrito)  — equivalente ao filtrarDistrito() no modo geo
//   .selecionarDistrito(l) — aplicado por selecionarBairro() ao clicar
// ═══════════════════════════════════════════════════════════════════════════

window.GeoMode = (function () {
  'use strict'

  // ── Estado interno ──────────────────────────────────────────────────────
  let _active        = false
  let _tileLayer     = null
  let _maskLayer     = null
  let _glowLayer     = null
  let _geojsonCache  = null   // GeoJSON data cacheado após primeiro fetch
  let _selectedLayer = null   // layer selecionado no modo geo
  let _filtroAtivo   = null   // distrito filtrado pelo dropdown
  let _pinsGroup     = null   // LayerGroup com os marcadores das lideranças

  // ── Paleta visual ───────────────────────────────────────────────────────
  const GEO = {
    tile:      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttr:  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',

    // Polígonos dos distritos — estado normal
    normal: {
      color:       '#38bdf8',
      weight:      1.8,
      opacity:     0.85,
      fillColor:   '#1e40af',
      fillOpacity: 0.10
    },
    // Hover
    hover: {
      color:       '#7dd3fc',
      weight:      2.8,
      opacity:     1,
      fillColor:   '#3b82f6',
      fillOpacity: 0.26
    },
    // Selecionado por clique ou busca
    selected: {
      color:       '#4ade80',
      weight:      3.2,
      opacity:     1,
      fillColor:   '#22c55e',
      fillOpacity: 0.28
    },
    // Não-selecionado quando há filtro ativo
    dimmed: {
      color:       '#38bdf8',
      weight:      0.8,
      opacity:     0.25,
      fillColor:   '#0f172a',
      fillOpacity: 0.04
    },

    // Máscara exterior
    maskFill:    '#000510',
    maskOpacity: 0.62,

    // Borda com glow
    glowColor:   '#38bdf8',
    glowWeight:  3.5,
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function _map()    { return window.map }
  function _layers() { return window.geoBairros }

  // ── Construir máscara invertida (exterior escurecido) ───────────────────
  // Usa fill-rule evenodd: o anel externo (mundo) preenche,
  // os anéis internos (contornos dos distritos) criam buracos transparentes.
  function _buildMask(geojson) {
    // Anel exterior em coordenadas GeoJSON [lng, lat]
    const worldRing = [
      [-180, -89.9], [-180, 89.9], [180, 89.9], [180, -89.9], [-180, -89.9]
    ]

    const holes = []
    geojson.features.forEach(f => {
      const g = f.geometry
      if (g.type === 'Polygon') {
        holes.push(g.coordinates[0])
      } else if (g.type === 'MultiPolygon') {
        g.coordinates.forEach(poly => holes.push(poly[0]))
      }
    })

    return L.geoJSON(
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [worldRing, ...holes] }, properties: {} },
      {
        style: {
          fillColor:   GEO.maskFill,
          fillOpacity: GEO.maskOpacity,
          color:       'transparent',
          weight:      0,
          fillRule:    'evenodd'   // ← garante o recorte correto
        },
        interactive: false,
        pane: 'geoMaskPane'
      }
    )
  }

  // ── Construir camada de borda com glow ─────────────────────────────────
  function _buildGlow(geojson) {
    return L.geoJSON(geojson, {
      style: {
        color:     GEO.glowColor,
        weight:    GEO.glowWeight,
        opacity:   0.9,
        fill:      false,
        className: 'geo-border-glow'
      },
      interactive: false,
      pane: 'geoGlowPane'
    })
  }

  // ── Estilo de um layer individual ───────────────────────────────────────
  function _styleFor(layer) {
    const isSelected = (layer === _selectedLayer)
    if (isSelected) return GEO.selected

    if (_filtroAtivo) {
      const nome = layer.feature.properties['NM_DIST']
      return nome === _filtroAtivo ? GEO.selected : GEO.dimmed
    }

    return GEO.normal
  }

  // ── Reaplicar estilos geo a todos os layers ─────────────────────────────
  function syncStyles() {
    const layers = _layers()
    if (!layers) return
    layers.eachLayer(layer => layer.setStyle(_styleFor(layer)))
  }

  // ── Filtrar distrito (chamado quando repaintMapa delega) ────────────────
  function filtrarGeo(distrito) {
    _filtroAtivo = distrito || null
    syncStyles()
  }

  // ── Selecionar distrito por clique ──────────────────────────────────────
  function selecionarDistrito(layer) {
    _selectedLayer = layer
    syncStyles()
  }

  // ── Pins das lideranças ─────────────────────────────────────────────────

  // Retorna a cor do pin com base no vínculo político
  function _corPin(vinculo) {
    const cands = (window.configSistema && window.configSistema.candidatos) || []
    const cand  = cands.find(c => c.chave === vinculo)
    if (cand && cand.cor_fundo) {
      // Cor mais vibrante: usa cor_texto se disponível, senão cor_fundo
      return cand.cor_texto || cand.cor_fundo
    }
    const defaults = { celia: '#ec4899', fernando: '#8b5cf6', ambos: '#38bdf8' }
    return defaults[vinculo] || '#38bdf8'
  }

  // Cria o ícone SVG do pin com animação de pulso
  function _criarIconePin(l) {
    const cor = _corPin(l.vinculo_politico)
    return L.divIcon({
      className: '',
      html: `<div class="geo-pin" title="${l.nome}">
               <div class="geo-pin-dot"  style="background:${cor};"></div>
               <div class="geo-pin-pulse" style="background:${cor};"></div>
             </div>`,
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
      popupAnchor:[0, -14]
    })
  }

  // Cria o HTML do popup da liderança
  function _criarPopupPin(l) {
    const cor  = _corPin(l.vinculo_politico)
    const cands = (window.configSistema && window.configSistema.candidatos) || []
    const cand  = cands.find(c => c.chave === l.vinculo_politico)
    const label = cand ? cand.nome.split(' ')[0] : (l.vinculo_politico || 'Ambos')
    const votos = Number(l.expectativa_votos || 0).toLocaleString('pt-BR')
    const bairroLabel = l.bairro ? `<div class="pgp-linha">📍 ${l.bairro}</div>` : ''
    const contatoLabel = l.contato ? `<div class="pgp-linha">📞 ${l.contato}</div>` : ''

    return `<div class="pgp-card">
      <div class="pgp-nome">${l.nome}</div>
      ${bairroLabel}
      ${contatoLabel}
      <div class="pgp-linha">🗳️ ${votos} votos esperados</div>
      <span class="pgp-badge" style="background:${cor};color:#fff;">${label}</span>
    </div>`
  }

  // Renderiza os pins de um array de lideranças
  function _renderizarPins(lista) {
    const map = _map()
    if (!map) return

    // Limpa grupo existente
    if (_pinsGroup) { map.removeLayer(_pinsGroup); _pinsGroup = null }
    if (!lista || !lista.length) return

    _pinsGroup = L.layerGroup()

    lista.forEach(l => {
      if (!l.lat || !l.lng) return
      const marker = L.marker([Number(l.lat), Number(l.lng)], {
        icon:      _criarIconePin(l),
        zIndexOffset: 500,
        riseOnHover:  true,
        pane:     'markerPane'
      })

      marker.bindPopup(_criarPopupPin(l), {
        className:   'pin-geo-popup',
        maxWidth:    260,
        autoPanPadding: [20, 20]
      })

      marker.on('mouseover', () => marker.openPopup())

      _pinsGroup.addLayer(marker)
    })

    _pinsGroup.addTo(map)
    console.log(`[GeoMode] ${lista.length} pins renderizados`)
  }

  // Busca pins do backend e renderiza
  async function refreshPins() {
    if (!_active) return
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const r = await fetch(`${window.API_URL}/liderancas/geo?mapa=pirai`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (!r.ok) return
      const lista = await r.json()
      _renderizarPins(lista)
    } catch (e) {
      console.warn('[GeoMode] refreshPins:', e)
    }
  }

  // Remove todos os pins do mapa
  function _clearPins() {
    const map = _map()
    if (_pinsGroup && map) { map.removeLayer(_pinsGroup); _pinsGroup = null }
  }

  // ── Hover handlers (adicionados quando geo mode ativa) ──────────────────
  let _hoverHandlers = []

  function _hookHovers() {
    const layers = _layers()
    if (!layers) return
    layers.eachLayer(layer => {
      const over = () => {
        if (!_active) return
        if (layer !== _selectedLayer) layer.setStyle(GEO.hover)
        layer.bringToFront()
      }
      const out = () => {
        if (!_active) return
        layer.setStyle(_styleFor(layer))
      }
      layer.on('mouseover', over)
      layer.on('mouseout',  out)
      _hoverHandlers.push({ layer, over, out })
    })
  }

  function _unhookHovers() {
    _hoverHandlers.forEach(({ layer, over, out }) => {
      layer.off('mouseover', over)
      layer.off('mouseout',  out)
    })
    _hoverHandlers = []
  }

  // ── Criação de panes Leaflet (uma única vez) ────────────────────────────
  function _ensurePanes() {
    const map = _map()
    if (!map) return

    if (!map.getPane('geoMaskPane')) {
      const p = map.createPane('geoMaskPane')
      p.style.zIndex       = 299    // entre tilePane(200) e overlayPane(400)
      p.style.pointerEvents = 'none'
    }
    if (!map.getPane('geoGlowPane')) {
      const p = map.createPane('geoGlowPane')
      p.style.zIndex       = 401    // logo acima dos polígonos (400)
      p.style.pointerEvents = 'none'
    }
  }

  // ── Ativar ──────────────────────────────────────────────────────────────
  async function ativar() {
    if (_active) return
    const map = _map()
    if (!map) { console.warn('[GeoMode] window.map não disponível'); return }

    // Carrega o GeoJSON se ainda não cacheado
    if (!_geojsonCache) {
      try {
        const r = await fetch('geo/pirai.geojson')
        _geojsonCache = await r.json()
      } catch (e) {
        console.error('[GeoMode] Erro ao carregar GeoJSON:', e)
        return
      }
    }

    _active = true

    // 1. Panes customizados
    _ensurePanes()

    // 2. Tile layer OSM
    _tileLayer = L.tileLayer(GEO.tile, {
      attribution: GEO.tileAttr,
      maxZoom:     19,
      className:   'geo-tile-layer'
    }).addTo(map)

    // Garante que tiles ficam abaixo de tudo
    _tileLayer.getPane().style.zIndex = 200

    // 3. Máscara exterior (exterior escurecido, Piraí recortado)
    _maskLayer = _buildMask(_geojsonCache)
    _maskLayer.addTo(map)

    // 4. Borda com glow
    _glowLayer = _buildGlow(_geojsonCache)
    _glowLayer.addTo(map)

    // 5. Reestilizar polígonos existentes para visual geo
    //    Sincroniza com o estado de seleção atual do mapa estratégico
    _selectedLayer = window._piraiLayerSelecionado || null
    syncStyles()

    // 6. Hooks de hover
    _hookHovers()

    // 7. Traz polígonos para frente dos tiles/máscara
    const layers = _layers()
    if (layers) layers.bringToFront()

    // 8. Classe CSS no body para overrides visuais
    document.body.classList.add('geo-mode-active')

    // 9. Carregar e renderizar pins das lideranças
    refreshPins()

    console.log('[GeoMode] Modo Geográfico ativado')
  }

  // ── Desativar ────────────────────────────────────────────────────────────
  function desativar() {
    if (!_active) return
    const map = _map()

    _active        = false
    _selectedLayer = null
    _filtroAtivo   = null

    // 1. Remove camadas geo
    if (_tileLayer) { map.removeLayer(_tileLayer); _tileLayer = null }
    if (_maskLayer) { map.removeLayer(_maskLayer); _maskLayer = null }
    if (_glowLayer) { map.removeLayer(_glowLayer); _glowLayer = null }
    _clearPins()

    // 2. Remove hooks de hover
    _unhookHovers()

    // 3. Remove classe CSS
    document.body.classList.remove('geo-mode-active')

    // 4. Restaura estilos do modo estratégico
    if (typeof window.repaintMapa === 'function') {
      // Chama diretamente a versão original (não delega de volta ao GeoMode)
      const _bkp = window.GeoMode
      window.GeoMode = null
      window.repaintMapa()
      window.GeoMode = _bkp
    }

    console.log('[GeoMode] Modo Estratégico restaurado')
  }

  function isAtivo() { return _active }

  // ── API pública ──────────────────────────────────────────────────────────
  return { ativar, desativar, isAtivo, syncStyles, filtrarGeo, selecionarDistrito, refreshPins }

})()
