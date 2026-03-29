/**
 * config.js — Configuração central do Paralax Gestão Política
 *
 * Para adaptar o sistema a um novo cliente, edite apenas este arquivo.
 * O backend e o frontend leem tudo daqui via GET /api/config.
 */

module.exports = {

  // ── Candidatos ─────────────────────────────────────────────────────────────
  //
  // "chave" é o identificador interno usado no banco de dados (vinculo_politico)
  // e nos selects do frontend. Não mude depois de ter dados gravados.
  //
  candidatos: [
    {
      chave:           'celia',
      nome:            'Célia Jordão',
      cor_fundo:       '#fce7f3',   // badge background
      cor_texto:       '#9d174d',   // badge text
    },
    {
      chave:           'fernando',
      nome:            'Fernando Jordão',
      cor_fundo:       '#ede9fe',
      cor_texto:       '#5b21b6',
    },
  ],

  // ── Identidade visual do sistema ───────────────────────────────────────────
  cores: {
    primaria:   '#1a56db',   // azul principal (botões, destaques)
    secundaria: '#0a2557',   // azul escuro (headers, gradientes)
  },

  // ── Mapas e sub-regiões ────────────────────────────────────────────────────
  //
  // Cada mapa gera automaticamente:
  //   • Um nível de usuário reconhecido pelo sistema de auth
  //   • As opções de sub-região no cadastro de usuários
  //   • O filtro de acesso restrito no mapa do frontend
  //
  mapas: [
    {
      id:            'angra',              // corresponde à pasta /angra no frontend
      nome:          'Angra dos Reis',
      nivel_usuario: 'lider_distrito_angra',
      badge_fundo:   '#fef9c3',            // cor do badge de nível na lista de usuários
      badge_texto:   '#713f12',
      subregioes: [
        '1º DISTRITO',
        '2º DISTRITO',
        '3º DISTRITO',
        '4º DISTRITO',
        '5º DISTRITO',
      ],
    },
    {
      id:            'rjcapital',          // corresponde à pasta /rjcapital no frontend
      nome:          'RJ Capital',
      nivel_usuario: 'lider_zona_rj',
      badge_fundo:   '#fce7f3',
      badge_texto:   '#9d174d',
      subregioes: [
        'ZONA NORTE',
        'ZONA SUL',
        'ZONA OESTE',
        'ZONA LESTE',
      ],
    },
  ],

};
