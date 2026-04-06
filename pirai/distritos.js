// ─────────────────────────────────────────────────────────────────
// distritos.js — Piraí
//
// Piraí possui 4 distritos (conforme GeoJSON NM_DIST):
//   Piraí · Arrozal · Monumento · Santanésia
//
// Como o GeoJSON já representa distritos (não bairros),
// cada feature.properties.NM_DIST é o próprio "distrito".
// ─────────────────────────────────────────────────────────────────

const distritos = {
  "Piraí": {
    lideres: [
      { nome: "Responsável", telefone: "", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["Piraí"]
  },

  "Arrozal": {
    lideres: [
      { nome: "Responsável", telefone: "", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["Arrozal"]
  },

  "Monumento": {
    lideres: [
      { nome: "Responsável", telefone: "", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["Monumento"]
  },

  "Santanésia": {
    lideres: [
      { nome: "Responsável", telefone: "", foto: "img/lideres/semfoto.jpg" }
    ],
    bairros: ["Santanésia"]
  }
};

// Para o GeoJSON de Piraí cada feature JÁ É um distrito,
// então a "chave" usada é NM_DIST — que corresponde exatamente
// às chaves do objeto acima.
function getDistrito(nomeDistrito) {
  if (!nomeDistrito) return "DESCONHECIDO";
  if (distritos[nomeDistrito]) return nomeDistrito;
  // Tenta normalizar (case-insensitive)
  const n = nomeDistrito.trim();
  for (const d in distritos) {
    if (d.toLowerCase() === n.toLowerCase()) return d;
  }
  return "DESCONHECIDO";
}

function getLideresPorBairro(nomeDistrito) {
  const d = getDistrito(nomeDistrito);
  if (d !== "DESCONHECIDO") return distritos[d].lideres;
  return [];
}
