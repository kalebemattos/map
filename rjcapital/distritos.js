// =============================================================
// distritos.js — Zonas e bairros do Rio de Janeiro Capital
// Ajuste os líderes e bairros conforme necessário
// =============================================================

const distritos = {

  "ZONA NORTE": {
    lideres: [
      { nome: "Líder Zona Norte", telefone: "(21) 99999-0001", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ABOLIÇÃO", "ACARI", "ÁGUA SANTA", "ANCHIETA", "ANDARAÍ", "BANCÁRIOS",
      "BENFICA", "BONSUCESSO", "BRÁS DE PINA", "CACHAMBI", "CACUIA", "CAMPINHO",
      "CASCADURA", "CATUMBI", "CAVALCANTI", "CIDADE UNIVERSITÁRIA", "COLÉGIO",
      "COMPLEXO DO ALEMÃO", "CORDOVIL", "COSTA BARROS", "DEL CASTILHO",
      "ENCANTADO", "ENGENHEIRO LEAL", "ENGENHO DA RAINHA", "ENGENHO DE DENTRO",
      "ENGENHO NOVO", "ESTÁCIO", "GALEÃO", "GRAJAÚ", "GUADALUPE", "HIGIENÓPOLIS",
      "HONÓRIO GURGEL", "INHAÚMA", "IRAJÁ", "JACARÉ", "JACAREZINHO", "JARDIM AMÉRICA",
      "JARDIM CARIOCA", "JARDIM GUANABARA", "LINS DE VASCONCELOS", "MADUREIRA",
      "MANGUEIRA", "MANGUINHOS", "MARACANÃ", "MARÉ", "MARECHAL HERMES", "MARIA DA GRAÇA",
      "MÉIER", "MONERÓ", "OLARIA", "OSWALDO CRUZ", "PARADA DE LUCAS", "PARQUE ANCHIETA",
      "PARQUE COLÚMBIA", "PAVUNA", "PENHA", "PENHA CIRCULAR", "PIEDADE", "PILARES",
      "PITANGUEIRAS", "PORTUGUESA", "QUINTINO BOCAIÚVA", "RAMOS", "RIACHUELO",
      "RIBEIRA", "ROCHA", "ROCHA MIRANDA", "SAMPAIO", "SÃO CRISTÓVÃO", "SÃO FRANCISCO XAVIER",
      "TAUÁ", "TIJUCA", "TOMÁS COELHO", "TURIAÇU", "VASCO DA GAMA", "VICENTE DE CARVALHO",
      "VIGÁRIO GERAL", "VILA DA PENHA", "VILA ISABEL", "VILA KOSMOS",
      "VISTA ALEGRE", "ZUMBI"
    ]
  },

  "ZONA SUL": {
    lideres: [
      { nome: "Líder Zona Sul", telefone: "(21) 99999-0002", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BOTAFOGO", "CATETE", "COPACABANA", "COSME VELHO", "FLAMENGO", "GÁVEA",
      "GLÓRIA", "HUMAITÁ", "IPANEMA", "JARDIM BOTÂNICO", "LAGOA", "LARANJEIRAS",
      "LEBLON", "LEME", "ROCINHA", "SÃO CONRADO", "URCA", "VIDIGAL"
    ]
  },

  "ZONA OESTE": {
    lideres: [
      { nome: "Líder Zona Oeste", telefone: "(21) 99999-0003", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BANGU", "BARRA DA TIJUCA", "BARRA DE GUARATIBA", "CAMORIM", "CAMPO DOS AFONSOS",
      "CAMPO GRANDE", "COSMOS", "CURICICA", "DEODORO", "GARDÊNIA AZUL", "GERICINÓ",
      "GRUMARI", "GUARATIBA", "INHOAÍBA", "ITANHANGÁ", "JABOUR", "JACAREPAGUÁ",
      "JOÁ", "MAGALHÃES BASTOS", "MANIA", "PADRE MIGUEL", "PACIÊNCIA",
      "PEDRA DE GUARATIBA", "PRAÇA SECA", "REALENGO", "RECREIO DOS BANDEIRANTES",
      "SANTA CRUZ", "SANTÍSSIMO", "SENADOR CAMARÁ", "SENADOR VASCONCELOS",
      "SEPETIBA", "TAQUARA", "VARGEM GRANDE", "VARGEM PEQUENA", "VILA KENNEDY",
      "VILA MILITAR", "VILA VALQUEIRE"
    ]
  },

  "ZONA LESTE": {
    lideres: [
      { nome: "Líder Zona Leste", telefone: "(21) 99999-0004", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BARROS FILHO", "BELFORD ROXO", "COELHO NETO", "COLÉGIO", "COMPLEXO DO ALEMÃO",
      "COSTA BARROS", "GUADALUPE", "HONÓRIO GURGEL", "IRAJÁ", "JARDIM AMÉRICA",
      "PARQUE ANCHIETA", "PARQUE COLÚMBIA", "PAVUNA", "ROCHA MIRANDA",
      "TURIAÇU", "VIGÁRIO GERAL", "VILA DA PENHA", "VILA KOSMOS", "VISTA ALEGRE"
    ]
  },

  "CENTRO": {
    lideres: [
      { nome: "Líder Centro", telefone: "(21) 99999-0005", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BENFICA", "CAJU", "CATUMBI", "CENTRO", "CIDADE NOVA", "ESTÁCIO",
      "GAMBOA", "LAPA", "MANGUEIRA", "PAQUETÁ", "PORTO MARAVILHA",
      "PRAÇA DA BANDEIRA", "SANTA TERESA", "SANTO CRISTO", "SAÚDE", "TIJUCA"
    ]
  }

}

// ─────────────────────────────────────────────
// ATENÇÃO: ajuste BAIRRO_PROP no mapa.js para
// bater com o campo do seu GeoJSON.
// Inspecione o arquivo assim:
//   fetch("geo/rj_bairros.geojson")
//     .then(r=>r.json())
//     .then(d=>console.log(d.features[0].properties))
// ─────────────────────────────────────────────

function getLideresPorBairro(bairroNome) {
  const n = bairroNome.toUpperCase().trim()
  for (const d in distritos) {
    if (distritos[d].bairros.includes(n)) return distritos[d].lideres
  }
  return []
}