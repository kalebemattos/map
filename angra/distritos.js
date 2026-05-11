const distritos = {
  "1º DISTRITO": {
    lideres: [
      { nome: "Hilton", telefone: "(24) 99999-1111", foto: "img/lideres/semfoto.jpg" },
      { nome: "Hudson", telefone: "(24) 99999-2222", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "BALNEÁRIO", "BONFIM", "CENTRO", "ILHA DA GIPÓIA", "MARINAS",
      "MORRO DA CRUZ", "MORRO DA GLÓRIA", "MORRO DO BULÉ", "MORRO DO MORENO",
      "PARAÍSO", "PARAISO", "PARQUE DAS PALMEIRAS", "PRAIA DA CHÁCARA",
      "PRAIA DO ANIL", "PRAIA DO JARDIM", "PRAIA GRANDE", "SÃO BENTO",
      "TANGUÁ", "VILA VELHA"
    ]
  },

  "2º DISTRITO": {
    lideres: [
      { nome: "Mauricio", telefone: "(24) 99999-3333", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "AREAL", "BANQUETA", "CAMPO BELO", "ENCRUZO DA ENSEADA", "ENSEADA",
      "GAMBOA DO BELÉM", "JAPUÍBA", "NOVA ANGRA", "PARQUE BELÉM",
      "PRAIA DA RIBEIRA", "PONTA DA RIBEIRA", "RETIRO", "VILA NOVA"
    ]
  },

  "3º DISTRITO": {
    lideres: [
      { nome: "Fernando", telefone: "(24) 99999-0003", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ÁGUA SANTA", "BNH", "BISCAIA", "CAETÉS", "CAMORIM", "CAMORIM PEQUENO",
      "CAPUTERA I", "CAPUTERA II", "CAPUTERA", "GARATUCAIA", "JACUECANGA",
      "JACUACANGA/VILAGGE/BNH", "JACUAGANGA", "LAMBICADA", "MACIÉIS",
      "MOMBAÇA", "MONSUABA", "PARAÍSO", "PONTA LESTE", "PORTOGALO",
      "PORTO GALO", "PRAIA DO MACHADO", "TERMINAL DA PETROBRÁS",
      "VILA DA PETROBRÁS", "ÁGUA SANTA/VILA PETROBRAS",
      "VILA DOS PESCADORES", "VILA PETROBRÁS", "VILLAGE",
      "VILLAGE JACUACANGA", "PONTALESTE/PARA/BISCAIA/MACI"
    ]
  },

  "4º DISTRITO": {
    lideres: [
      { nome: "Thadeu", telefone: "(24) 99999-0004", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: [
      "ARIRÓ", "BRACUÍ", "CAIEIRA", "FRADE", "GAMBOA DO BRACUÍ", "GRATAÚ",
      "ITANEMA", "PARQUE MAMBUCABA", "PIRAQUARA", "PONTA DO SAPÊ", "PONTAL",
      "PORTO FRADE", "PRAIA BRAVA", "PRAIA DO RECIFE", "PRAIA VERMELHA",
      "RESERVA INDÍGENA", "SANTA RITA DO BRACUÍ", "SERRA D'ÁGUA",
      "SERTÃO DO BRACUÍ", "USINA NUCLEAR", "VILA HISTÓRICA DE MAMBUCABA",
      "ZUNGU"
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
      "LOPES MENDES", "MATARIZ", "PARNAIOCA", "PONTA DOS CASTELHANOS",
      "PRAIA DA LONGA", "PRAIA VERMELHA DA ILHA GRANDE",
      "PRAIA VERMELHA DA I. GRANDE", "PROVETÁ", "VILA DO ABRAÃO", "ILHA GRANDE"
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