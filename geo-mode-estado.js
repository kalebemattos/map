// ═══════════════════════════════════════════════════════════════════════════
// GEO-MODE-ESTADO.JS  —  Modo Geográfico  •  Mapa do Estado do RJ
//
// Camada COMPLEMENTAR ao Modo Estratégico existente.
// Não remove nem altera a lógica original — apenas se sobrepõe quando ativo.
//
// API pública (window.GeoModeEstado):
//   .ativar()              — liga o modo geográfico
//   .desativar()           — desliga e restaura o modo estratégico
//   .isAtivo()             — boolean
//   .syncStyles()          — reaplica estilos geo a todos os municípios
//   .selecionarDistrito(l) — chamado por selecionarCidade() ao clicar
// ═══════════════════════════════════════════════════════════════════════════

window.GeoModeEstado = (function () {
  'use strict'

  // ── Estado interno ──────────────────────────────────────────────────────
  let _active        = false
  let _tileLayer     = null
  let _maskLayer     = null
  let _glowLayer     = null
  let _geojsonCache  = null   // GeoJSON cacheado após primeiro fetch
  let _selectedLayer = null   // layer selecionado no modo geo
  let _pinsGroup     = null   // LayerGroup com os marcadores das lideranças

  // URL do mesmo GeoJSON usado pelo mapa
  const GEOJSON_URL = 'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-33-mun.json'

  // ── Paleta visual ───────────────────────────────────────────────────────
  const GEO = {
    tile:      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttr:  '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',

    normal: {
      color:       '#38bdf8',
      weight:      1.2,
      opacity:     0.80,
      fillColor:   '#1e40af',
      fillOpacity: 0.10
    },
    hover: {
      color:       '#7dd3fc',
      weight:      2.4,
      opacity:     1,
      fillColor:   '#3b82f6',
      fillOpacity: 0.26
    },
    selected: {
      color:       '#4ade80',
      weight:      2.8,
      opacity:     1,
      fillColor:   '#22c55e',
      fillOpacity: 0.28
    },
    dimmed: {
      color:       '#38bdf8',
      weight:      0.5,
      opacity:     0.20,
      fillColor:   '#0f172a',
      fillOpacity: 0.04
    },

    maskFill:    '#000510',
    maskOpacity: 0.60,
    glowColor:   '#38bdf8',
    glowWeight:  3.0,
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function _map()    { return window.map }
  function _layers() { return window.layerRJ }

  // ── Construir máscara invertida ─────────────────────────────────────────
  function _buildMask(geojson) {
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
          fillRule:    'evenodd'
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
        opacity:   0.85,
        fill:      false,
        className: 'geo-border-glow'
      },
      interactive: false,
      pane: 'geoGlowPane'
    })
  }

  // ── Estilo de um layer individual ───────────────────────────────────────
  function _styleFor(layer) {
    if (layer === _selectedLayer) return GEO.selected
    return GEO.normal
  }

  // ── Reaplicar estilos geo a todos os layers ─────────────────────────────
  function syncStyles() {
    const layers = _layers()
    if (!layers) return
    layers.eachLayer(layer => layer.setStyle(_styleFor(layer)))
  }

  // ── Selecionar município por clique ──────────────────────────────────────
  function selecionarDistrito(layer) {
    _selectedLayer = layer
    syncStyles()
  }

  // ── Pins das lideranças ─────────────────────────────────────────────────

  function _corPin(vinculo) {
    const cands = (window.configSistema && window.configSistema.candidatos) || []
    const cand  = cands.find(c => c.chave === vinculo)
    if (cand && cand.cor_fundo) return cand.cor_texto || cand.cor_fundo
    const defaults = { celia: '#ec4899', fernando: '#8b5cf6', ambos: '#38bdf8' }
    return defaults[vinculo] || '#38bdf8'
  }

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

  function _criarPopupPin(l) {
    const cor   = _corPin(l.vinculo_politico)
    const cands = (window.configSistema && window.configSistema.candidatos) || []
    const cand  = cands.find(c => c.chave === l.vinculo_politico)
    const label = cand ? cand.nome.split(' ')[0] : (l.vinculo_politico || 'Ambos')
    const votos = Number(l.expectativa_votos || 0).toLocaleString('pt-BR')
    const cidadeLabel  = l.cidade  ? `<div class="pgp-linha">🏙️ ${l.cidade}</div>`  : ''
    const bairroLabel  = l.bairro  ? `<div class="pgp-linha">📍 ${l.bairro}</div>`  : ''
    const contatoLabel = l.contato ? `<div class="pgp-linha">📞 ${l.contato}</div>` : ''
    return `<div class="pgp-card">
      <div class="pgp-nome">${l.nome}</div>
      ${cidadeLabel}
      ${bairroLabel}
      ${contatoLabel}
      <div class="pgp-linha">🗳️ ${votos} votos esperados</div>
      <span class="pgp-badge" style="background:${cor};color:#fff;">${label}</span>
    </div>`
  }

  function _renderizarPins(lista) {
    const map = _map()
    if (!map) return
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
    console.log(`[GeoModeEstado] ${lista.length} pins renderizados`)
  }

  async function refreshPins() {
    if (!_active) return
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const r = await fetch(`${window.API_URL}/liderancas/geo?mapa=estado`, {
        headers: { Authorization: 'Bearer ' + token }
      })
      if (!r.ok) return
      _renderizarPins(await r.json())
    } catch (e) {
      console.warn('[GeoModeEstado] refreshPins:', e)
    }
  }

  function _clearPins() {
    const map = _map()
    if (_pinsGroup && map) { map.removeLayer(_pinsGroup); _pinsGroup = null }
  }

  // ── Hover handlers ──────────────────────────────────────────────────────
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

  // ── Criação de panes Leaflet ────────────────────────────────────────────
  function _ensurePanes() {
    const map = _map()
    if (!map) return
    if (!map.getPane('geoMaskPane')) {
      const p = map.createPane('geoMaskPane')
      p.style.zIndex        = 299
      p.style.pointerEvents = 'none'
    }
    if (!map.getPane('geoGlowPane')) {
      const p = map.createPane('geoGlowPane')
      p.style.zIndex        = 401
      p.style.pointerEvents = 'none'
    }
  }

  // ── Ativar ──────────────────────────────────────────────────────────────
  async function ativar() {
    if (_active) return
    const map = _map()
    if (!map) { console.warn('[GeoModeEstado] window.map não disponível'); return }
    if (!_layers()) { console.warn('[GeoModeEstado] layerRJ ainda não carregado'); return }

    // Usa GeoJSON cacheado pelo mapa principal (exposto em window._estadoGeoJsonRaw),
    // ou re-faz o fetch se ainda não disponível.
    if (!_geojsonCache) {
      if (window._estadoGeoJsonRaw) {
        _geojsonCache = window._estadoGeoJsonRaw
      } else {
        try {
          const r = await fetch(GEOJSON_URL)
          _geojsonCache = await r.json()
        } catch (e) {
          console.error('[GeoModeEstado] Erro ao carregar GeoJSON:', e)
          return
        }
      }
    }

    _active = true

    _ensurePanes()

    _tileLayer = L.tileLayer(GEO.tile, {
      attribution: GEO.tileAttr,
      maxZoom:     19,
      className:   'geo-tile-layer'
    }).addTo(map)
    _tileLayer.getPane().style.zIndex = 200

    _maskLayer = _buildMask(_geojsonCache)
    _maskLayer.addTo(map)

    _glowLayer = _buildGlow(_geojsonCache)
    _glowLayer.addTo(map)

    _selectedLayer = window._estadoLayerSelecionado || null
    syncStyles()

    _hookHovers()

    const layers = _layers()
    if (layers) layers.bringToFront()

    document.body.classList.add('geo-mode-active')

    if (typeof window.repaintMap === 'function') window.repaintMap()
    const cidade = window._getCidadeSelecionada ? window._getCidadeSelecionada() : null
    if (cidade && typeof window.renderLiderancas === 'function') {
      window.renderLiderancas(cidade)
    }

    // Força o Leaflet a recalcular o tamanho e renderizar os tiles
    setTimeout(() => map.invalidateSize(), 50)

    refreshPins()

    console.log('[GeoModeEstado] Modo Geográfico ativado (Estado RJ)')
  }

  // ── Desativar ────────────────────────────────────────────────────────────
  function desativar() {
    if (!_active) return
    const map = _map()

    _active        = false
    _selectedLayer = null

    if (_tileLayer) { map.removeLayer(_tileLayer); _tileLayer = null }
    if (_maskLayer) { map.removeLayer(_maskLayer); _maskLayer = null }
    if (_glowLayer) { map.removeLayer(_glowLayer); _glowLayer = null }
    _clearPins()

    _unhookHovers()

    document.body.classList.remove('geo-mode-active')

    if (typeof window.repaintMap === 'function') {
      const _bkp = window.GeoModeEstado
      window.GeoModeEstado = null
      window.repaintMap()
      window.GeoModeEstado = _bkp
    }

    const cidade = window._getCidadeSelecionada ? window._getCidadeSelecionada() : null
    if (cidade && typeof window.renderLiderancas === 'function') {
      window.renderLiderancas(cidade)
    }

    // Força recálculo do tamanho após remover o tile layer
    const map2 = _map()
    if (map2) setTimeout(() => map2.invalidateSize(), 50)

    console.log('[GeoModeEstado] Modo Estratégico restaurado (Estado RJ)')
  }

  function isAtivo() { return _active }

  return { ativar, desativar, isAtivo, syncStyles, selecionarDistrito, refreshPins }

})()
