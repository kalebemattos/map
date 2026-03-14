const distritos = {
  "1º DISTRITO": {
    lideres: [
      { nome: "Hilton", telefone: "(24) 99999-1111", foto: "img/lideres/semfoto.jpg" },
      { nome: "Hudson", telefone: "(24) 99999-2222", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["BALNEÁRIO", "BONFIM", "CENTRO", "COLÉGIO NAVAL", "ILHA DA GIPÓIA", "MARINAS", "MORRO DA CRUZ", "MORRO DO ABEL", "MORRO DA CARIOCA", "MORRO DO SANTO ANTÔNIO", "MORRO DA CAIXA D'ÁGUA", "MORRO DO CARMO", "MORRO DA FORTALEZA", "MORRO DO PEREZ", "MORRO DA GLÓRIA", "MORRO DA GLÓRIA I", "MORRO DA GLÓRIA II", "MORRO DO TATU", "MORRO DO BULÉ", "PARAISO", "PARQUE DAS PALMEIRAS", "PRAIA DA CHÁCARA", "PRAIA DO ANIL", "PRAIA DO JARDIM", "PRAIA GRANDE", "SÃO BENTO", "TANGUÁ", "VILA VELHA", "SAPINHATUBA I", "MONTE CASTELO", "SAPINHATUBA III"]
  },

  "2º DISTRITO": {
    lideres: [
      { nome: "Mauricio", telefone: "(24) 99999-3333", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["AREAL", "ARIRÓ", "BANQUETA", "BRACUÍ", "CAIEIRA", "CAMPO BELO", "DIVINÉIA", "ENCRUZO DA ENSEADA", "ENSEADA", "GAMBOA DO BELÉM", "GAMBOA DO BRACUÍ", "GRATAÚ", "ILHA DA BARRA", "ILHA DO JORGE", "ITANEMA", "JAPUÍBA", "NOVA ANGRA", "PARQUE BELÉM", "PIRAQUARA", "PONTA DA CRUZ", "PONTA DO PARTIDO", "PONTA DO SAPÊ", "PONTA DOS UBÁS", "PONTA DA RIBEIRA", "PONTAL", "PORTO FRADE", "PORTO GALO", "PRAIA DA RIBEIRA", "PRAIA DO RECIFE", "RETIRO", "SERRA D'ÁGUA", "SERTÃO DE ITANEMA", "USINA NUCLEAR", "VILA NOVA", "ZUNGU"]
  },

  "3º DISTRITO": {
    lideres: [
      { nome: "Fernando", telefone: "(24) 99999-0003", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["MOMBAÇA", "CIDADE DA BÍBLIA", "CAMORIM", "CAMORIM PEQUENO", "CANTAGALO", "PONTA LESTE", "PARAÍSO", "ÁGUA SANTA", "LAMBICADA", "PRAIA DO MACHADO", "JACUACANGA/VILAGGE/BNH", "JACUAGANGA", "JACUECANGA", "ÁGUA SANTA/VILA PETROBRAS", "CAPUTERA I", "CAPUTERA II", "CAPUTERA", "MONSUABA", "PORTOGALO", "PONTALESTE/PARA/BISCAIA/MACI", "VILA DA PETROBRÁS", "VILA DOS PESCADORES", "VILLAGE JACUACANGA", "TERMINAL DA PETROBRÁS", "BISCAIA", "CAETÉS", "GARATUCAIA", "MORRO DO MORENO", "MACIÉIS"]
  },

  "4º DISTRITO": {
    lideres: [
      { nome: "Thadeu", telefone: "(24) 99999-0004", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["PARQUE MAMBUCABA", "PARQUE PEREQUÊ", "PRAIA BRAVA", "PRAIA DAS GOIABAS", "PRAIA VERMELHA", "SERTÃO DE MAMBUCABA", "VILA HISTÓRICA DE MAMBUCABA", "FRADE", "BRACUÍ", "RESERVA INDÍGENA", "SANTA RITA DO BRACUÍ", "SERTÃO DE ITANEMA", "SERTÃO DO BRACUÍ"]
  },

  "5º DISTRITO": {
    lideres: [
      { nome: "Ze Augusto", telefone: "(24) 99999-0005", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["ABRAÃOZINHO", "ARAÇATIBA", "AVENTUREIRO", "BANANAL", "DOIS RIOS", "ENSEADA DAS ESTRELAS", "ENSEADA DAS PALMAS", "ENSEADA DO SÍTIO FORTE", "ENSEADA DO SÍTIO FORTES", "FREGUESIA DE SANTANA", "GUAXUMA", "LOPES MENDES", "MATARIZ", "PARNAIOCA", "PONTA DOS CASTELHANOS", "PRAIA DA LONGA", "PRAIA VERMELHA DA I. GRANDE", "PRAIA VERMELHA DA ILHA GRANDE", "PROVETÁ", "VILA DO ABRAÃO", "ILHA GRANDE"]
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