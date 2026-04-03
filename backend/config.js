/**
 * config.js — fallback de boot
 *
 * Este arquivo NÃO é mais a fonte de verdade da configuração.
 * Os dados reais ficam nas tabelas tenant_config, tenant_candidatos,
 * tenant_mapas e tenant_regioes no banco de dados.
 *
 * Este arquivo é usado APENAS para:
 *   1. Derivar NIVEIS_MAPA / NIVEIS_TODOS no boot (antes do banco responder)
 *   2. Servir de fallback se a query de config falhar
 *
 * Para alterar candidatos, mapas ou regiões de um tenant,
 * use as rotas /api/admin/config/* no painel de administração.
 */

module.exports = {
  candidatos: [
    { chave: 'celia',    nome: 'Célia Jordão',    cor_fundo: '#fce7f3', cor_texto: '#9d174d', tem_votos_2022: true  },
    { chave: 'fernando', nome: 'Fernando Jordão', cor_fundo: '#ede9fe', cor_texto: '#5b21b6', tem_votos_2022: false },
  ],
  cores: {
    primaria:   '#1a56db',
    secundaria: '#0a2557',
  },
  mapas: [
    { id: 'angra',     nome: 'Angra dos Reis', nivel_usuario: 'lider_distrito_angra', badge_fundo: '#fef9c3', badge_texto: '#713f12', subregioes: ['1º DISTRITO','2º DISTRITO','3º DISTRITO','4º DISTRITO','5º DISTRITO'] },
    { id: 'rjcapital', nome: 'RJ Capital',     nivel_usuario: 'lider_zona_rj',        badge_fundo: '#fce7f3', badge_texto: '#9d174d', subregioes: ['ZONA NORTE','ZONA SUL','ZONA OESTE','ZONA LESTE'] },
  ],
  regioes: [
    { chave: 'metropolitana',      label: 'Metropolitana',       cidades: [], lideres: [] },
    { chave: 'baixadasLitoraneas', label: 'Baixadas Litorâneas', cidades: [], lideres: [] },
    { chave: 'norteFluminense',    label: 'Norte Fluminense',    cidades: [], lideres: [] },
    { chave: 'noroesteFluminense', label: 'Noroeste Fluminense', cidades: [], lideres: [] },
    { chave: 'serrana',            label: 'Serrana',             cidades: [], lideres: [] },
    { chave: 'centroSulFluminense',label: 'Centro-Sul Fluminense',cidades:[], lideres: [] },
    { chave: 'medioParaiba',       label: 'Médio Paraíba',       cidades: [], lideres: [] },
    { chave: 'costaVerde',         label: 'Costa Verde',         cidades: [], lideres: [] },
  ],
};