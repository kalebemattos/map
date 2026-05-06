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
      tem_votos_2022:  true,        // foi candidata em 2022 → exibe card de votação
    },
    {
      chave:           'fernando',
      nome:            'Fernando Jordão',
      cor_fundo:       '#ede9fe',
      cor_texto:       '#5b21b6',
      tem_votos_2022:  false,       // não foi candidato em 2022 → sem card de votação
    },
  ],

  // ── Identidade visual do sistema ───────────────────────────────────────────
  cores: {
    primaria:   '#1a56db',   // azul principal (botões, destaques)
    secundaria: '#0a2557',   // azul escuro (headers, gradientes)
  },

  // ── Regiões do mapa principal (estado do RJ) ──────────────────────────────
  //
  // Cada entrada gera automaticamente:
  //   • Uma opção no select "Filtrar por Região"
  //   • O realce dos municípios no mapa
  //   • O card de totais da região
  //   • O card de líder da região
  //
  regioes: [
    {
      chave:  'metropolitana',
      label:  'Metropolitana',
      cidades: [
        'Rio de Janeiro', 'Niterói', 'São Gonçalo', 'Itaboraí', 'Maricá', 'Tanguá',
        'Rio Bonito', 'Cachoeiras de Macacu', 'Guapimirim', 'Magé', 'Duque de Caxias',
        'Nova Iguaçu', 'Belford Roxo', 'São João de Meriti', 'Nilópolis', 'Mesquita',
        'Queimados', 'Japeri', 'Seropédica', 'Itaguaí', 'Paracambi',
      ],
      lideres: [
        { nome: 'Léo Marmoraria', contato: '', foto: 'img/lideres/Léo Marmoraria.jpg' },
      ],
    },
    {
      chave:  'baixadasLitoraneas',
      label:  'Baixadas Litorâneas',
      cidades: [
        'Araruama', 'Arraial do Cabo', 'Armação dos Búzios', 'Cabo Frio', 'Iguaba Grande',
        'São Pedro da Aldeia', 'Saquarema', 'Silva Jardim', 'Casimiro de Abreu', 'Rio das Ostras',
      ],
      lideres: [
        { nome: 'Zé Antonio', contato: '24 99991-4802', foto: 'img/lideres/Zé Antonio.jpg' },
      ],
    },
    {
      chave:  'norteFluminense',
      label:  'Norte Fluminense',
      cidades: [
        'Campos dos Goytacazes', 'São João da Barra', 'São Francisco de Itabapoana',
        'Macaé', 'Carapebus', 'Quissamã', 'Conceição de Macabu',
      ],
      lideres: [
        { nome: 'Marllon Jesus', contato: '24 99988-0848', foto: 'img/lideres/Marllon Jesus.jpg' },
      ],
    },
    {
      chave:  'noroesteFluminense',
      label:  'Noroeste Fluminense',
      cidades: [
        'Itaperuna', 'Bom Jesus do Itabapoana', 'Natividade', 'Porciúncula', 'Varre-Sai',
        'Miracema', 'Cambuci', 'Italva', 'Cardoso Moreira', 'Laje do Muriaé', 'Aperibé',
        'Santo Antônio de Pádua', 'São José de Ubá', 'Itaocara',
      ],
      lideres: [
        { nome: 'Hilton', contato: '', foto: 'img/lideres/Hilton.jpg' },
      ],
    },
    {
      chave:  'serrana',
      label:  'Serrana',
      cidades: [
        'Petrópolis', 'Teresópolis', 'Duas Barras', 'Nova Friburgo', 'Bom Jardim', 'Sumidouro', 'Cantagalo',
        'Cordeiro', 'Santa Maria Madalena', 'Trajano de Moraes', 'São Sebastião do Alto', 'Macuco',
        'Carmo', 'São José do Vale do Rio Preto',
      ],
      lideres: [
        { nome: 'Ziquinho', contato: '', foto: 'img/lideres/Ziquinho.jpg' },
      ],
    },
    {
      chave:  'centroSulFluminense',
      label:  'Centro-Sul Fluminense',
      cidades: [
        'Paraíba do Sul', 'Três Rios', 'Sapucaia', 'Comendador Levy Gasparian', 'Areal',
        'Paty do Alferes', 'Miguel Pereira', 'Vassouras', 'Engenheiro Paulo de Frontin',
        'Mendes', 'Piraí',
      ],
      lideres: [
        { nome: 'Dr. Renan', contato: '', foto: 'img/lideres/Dr. Renan.jpg' },
      ],
    },
    {
      chave:  'medioParaiba',
      label:  'Médio Paraíba',
      cidades: [
        'Barra Mansa', 'Volta Redonda', 'Resende', 'Itatiaia', 'Quatis', 'Porto Real', 'Pinheiral',
        'Valença', 'Rio das Flores', 'Barra do Piraí', 'Rio Claro',
      ],
      lideres: [
        { nome: 'Glauco',   contato: '', foto: 'img/lideres/Glauco.jpg' },
        { nome: 'Flavinho', contato: '', foto: 'img/lideres/Flavinho.jpg' },
      ],
    },
    {
      chave:  'costaVerde',
      label:  'Costa Verde',
      cidades: [
        'Angra dos Reis', 'Paraty', 'Mangaratiba',
      ],
      lideres: [
        { nome: 'Aurelio Marques', contato: '', foto: 'img/lideres/Aurelio Marques.jpg' },
      ],
    },
  ],

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
    {
      id:            'pirai',              // corresponde à pasta /pirai no frontend
      nome:          'Piraí',
      nivel_usuario: 'lider_distrito_pirai',
      badge_fundo:   '#d1fae5',
      badge_texto:   '#065f46',
      subregioes: [
        'Piraí',
        'Arrozal',
        'Monumento',
        'Santanésia',
      ],
    },
  ],

};
