const distritos = {
  "1º DISTRITO": {
    lideres: [
      { nome: "Hilton", telefone: "(24) 99999-1111", foto: "img/lideres/semfoto.jpg" },
      { nome: "Hudson", telefone: "(24) 99999-2222", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BALNEÁRIO", "BONFIM", "CENTRO", "CIDADE DA BÍBLIA", "COLÉGIO NAVAL",
      "ILHA DA GIPÓIA", "MARINAS", "MORRO DA CAIXA D'ÁGUA", "MORRO DA CARIOCA",
      "MORRO DA CRUZ", "MORRO DA FORTALEZA", "MORRO DA GLÓRIA",
      "MORRO DA GLÓRIA I", "MORRO DA GLÓRIA II", "MORRO DO ABEL",
      "MORRO DO BULÉ", "MORRO DO CARMO", "MORRO DO PEREZ",
      "MORRO DO SANTO ANTÔNIO", "MORRO DO TATU", "PARQUE DAS PALMEIRAS",
      "PRAIA DA CHÁCARA", "PRAIA DO ANIL", "PRAIA DO JARDIM", "PRAIA GRANDE",
      "SAPINHATUBA I", "SAPINHATUBA II", "SAPINHATUBA III",
      "SÃO BENTO", "TANGUÁ", "VILA VELHA"
    ]
  },

  "2º DISTRITO": {
    lideres: [
      { nome: "Mauricio", telefone: "(24) 99999-3333", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "AREAL", "BANQUETA", "CAMPO BELO", "DIVINÉIA", "ENCRUZO DA ENSEADA",
      "ENSEADA", "GAMBOA DO BELÉM", "JAPUÍBA", "NOVA ANGRA", "PARQUE BELÉM",
      "PONTA DO SAPÊ", "PONTA DOS UBÁS", "PRAIA DA RIBEIRA", "RETIRO", "VILA NOVA"
    ]
  },

  "3º DISTRITO": {
    lideres: [
      { nome: "Fernando", telefone: "(24) 99999-0003", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ÁGUA SANTA/VILA PETROBRAS", "BISCAIA", "CAETÉS", "CAMORIM",
      "CAMORIM PEQUENO", "CANTAGALO", "CAPUTERA", "CAPUTERA I", "CAPUTERA II",
      "GARATUCAIA", "JACUECANGA", "LAMBICADA", "MACIÉIS", "MOMBAÇA",
      "MONSUABA", "MORRO DO MORENO", "PARAISO", "PARAÍSO",
      "PORTOGALO", "PRAIA DO MACHADO", "TERMINAL DA PETROBRÁS",
      "VILA DA PETROBRÁS", "VILA DOS PESCADORES", "VILLAGE JACUACANGA",
      // aliases de compatibilidade com registros legados
      "ÁGUA SANTA", "BNH", "JACUACANGA/VILAGGE/BNH", "JACUAGANGA",
      "PONTA LESTE", "PORTO GALO", "VILA PETROBRÁS", "VILLAGE",
      "PONTALESTE/PARA/BISCAIA/MACI"
    ]
  },

  "4º DISTRITO": {
    lideres: [
      { nome: "Thadeu", telefone: "(24) 99999-0004", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ARIRÓ", "BRACUÍ", "CAIEIRA", "FRADE", "GAMBOA DO BRACUÍ", "GRATAÚ",
      "ILHA COMPRIDA", "ILHA DA BARRA", "ILHA DO JORGE", "ITANEMA",
      "MORRO DA BOA VISTA", "PARQUE MAMBUCABA", "PARQUE PEREQUÊ", "PIRAQUARA",
      "PONTA DA CRUZ", "PONTA DO PARTIDO", "PONTAL", "PORTO FRADE",
      "PRAIA BRAVA", "PRAIA DAS GOIABAS", "PRAIA DO RECIFE", "PRAIA VERMELHA",
      "RESERVA INDÍGENA", "SANTA RITA DO BRACUÍ", "SERRA D'ÁGUA",
      "SERTÃO DE ITANEMA", "SERTÃO DE MAMBUCABA", "SERTÃO DO BRACUÍ",
      "USINA NUCLEAR", "VILA HISTÓRICA DE MAMBUCABA", "ZUNGU"
    ]
  },

  "5º DISTRITO": {
    lideres: [
      { nome: "Ze Augusto", telefone: "(24) 99999-0005", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ABRAÃOZINHO", "ARAÇATIBA", "AVENTUREIRO", "BANANAL", "DOIS RIOS",
      "ENSEADA DAS ESTRELAS", "ENSEADA DAS PALMAS", "ENSEADA DO SÍTIO FORTE",
      "ENSEADA DO SÍTIO FORTES", "FREGUESIA DE SANTANA", "GUAXUMA",
      "ILHA GRANDE", "LOPES MENDES", "MATARIZ", "PARNAIOCA",
      "PONTA DOS CASTELHANOS", "PRAIA DA LONGA",
      "PRAIA VERMELHA DA ILHA GRANDE", "PRAIA VERMELHA DA I. GRANDE",
      "PROVETÁ", "VILA DO ABRAÃO"
    ]
  }
};

function getDistrito(bairro) {
  if (!bairro) return "DESCONHECIDO";
  const bairroNormalizado = bairro.toUpperCase().trim();
  for (const d in distritos) {
    if (distritos[d].bairros.includes(bairroNormalizado)) return d;
  }
  return "DESCONHECIDO";
}

function getLideresPorBairro(bairroNome) {
  const nomeDistrito = getDistrito(bairroNome);
  if (nomeDistrito !== "DESCONHECIDO") return distritos[nomeDistrito].lideres;
  return [];
}