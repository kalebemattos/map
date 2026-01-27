/* * Arquivo: data.js
 * Contém os dados de votos, deputados e regiões para o mapa.
 */

/* ===== Dados de votos válidos (mantido) ===== */
const votosValidos = {
  "Angra dos Reis": 137275, "Aperibé": 10245, "Araruama": 108199, "Areal": 10372,
  "Armação dos Búzios": 36142, "Arraial do Cabo": 36527, "Barra do Piraí": 70813,
  "Barra Mansa": 135848, "Belford Roxo": 347207, "Bom Jardim": 22845,
  "Bom Jesus do Itabapoana": 30213, "Cabo Frio": 172788, "Cachoeiras de Macacu": 47598,
  "Cambuci": 12490, "Campos dos Goytacazes": 373543, "Cantagalo": 16094, "Carapebus": 14412,
  "Cardoso Moreira": 13308, "Carmo": 15064, "Comendador Levy Gasparian": 8379,
  "Casimiro de Abreu": 36308, "Conceição de Macabu": 17978, "Cordeiro": 17649,
  "Duas Barras": 10606, "Duque de Caxias": 674805, "Engenheiro Paulo de Frontin": 11693,
  "Guapimirim": 45159, "Iguaba Grande": 30536, "Itaboraí": 178787, "Itaguaí": 100590,
  "Italva": 12146, "Itaocara": 20026, "Itaperuna": 76807, "Itatiaia": 26965,
  "Japeri": 77400, "Laje do Muriaé": 7713, "Macaé": 182529, "Macuco": 7438, "Magé": 201611,
  "Mangaratiba": 46874, "Maricá": 172611, "Mendes": 15908, "Mesquita": 138158,
  "Miguel Pereira": 24983, "Miracema": 22879, "Natividade": 13055, "Nilópolis": 131876,
  "Niterói": 410032, "Nova Friburgo": 156323, "Nova Iguaçu": 617657, "Paracambi": 34398,
  "Paraty": 35398, "Paraíba do Sul": 34970, "Paty do Alferes": 24460, "Petrópolis": 245177,
  "Pinheiral": 19082, "Piraí": 24053, "Porciúncula": 14651, "Porto Real": 18853,
  "Quatis": 11109, "Queimados": 102150, "Quissamã": 20097, "Resende": 99023,
  "Rio Bonito": 46133, "Rio Claro": 15990, "Rio das Flores": 8970,
  "Rio das Ostras": 101504, "Rio de Janeiro": 5009373, "Santa Maria Madalena": 9404,
  "Santo Antônio de Pádua": 34328, "Sapucaia": 16825, "Saquarema": 86791,
  "Seropédica": 61634, "Silva Jardim": 19993, "Sumidouro": 15000, "São Fidélis": 32264,
  "São Francisco de Itabapoana": 40689, "São Gonçalo": 665181, "São José de Ubá": 7837,
  "São José do Vale do Rio Preto": 17532, "São João da Barra": 42014,
  "São João de Meriti": 373602, "São Pedro da Aldeia": 73690,
  "São Sebastião do Alto": 8134, "Tanguá": 26854, "Teresópolis": 132969,
  "Trajano de Moraes": 9482, "Três Rios": 63730, "Valença": 58034, "Varre-Sai": 9143,
  "Vassouras": 31318, "Volta Redonda": 225626
};

/* ===== Dados dos 5 deputados por cidade (mantido) ===== */
const deputadosByCity = { 
  "Angra dos Reis":[{"name":"CÉLIA JORDÃO","votes":31363},{"name":"GREG DUARTE","votes":6710},{"name":"EDINHO RODRIGUES","votes":4306},{"name":"JORGE FELIPPE NETTO","votes":2317},{"name":"GUSTAVO TUTUCA","votes":1569}],
  "Aperibé":[{"name":"DR FABIO BINHA","votes":3738},{"name":"JAIR BITTENCOURT","votes":1098},{"name":"RODRIGO BACELAR","votes":425},{"name":"GIOVANI RATINHO","votes":250},{"name":"BRUNO DAUAIRE","votes":223}],
  "Araruama":[{"name":"RAIANA CHIQUINHO","votes":17067},{"name":"DR PEDRO RICARDO","votes":3494},{"name":"FRANCIANE MOTTA","votes":3420},{"name":"MARCIO CANELLA","votes":3225},{"name":"DR SERGINHO","votes":2884}],
  "Areal":[{"name":"DR SERGINHO","votes":689},{"name":"BERNARDO ROSSI","votes":396},{"name":"EURICO JUNIOR","votes":372},{"name":"SARAH PONCIO","votes":361},{"name":"DANIEL LUIZ MARTINS","votes":351}],
  "Armação dos Búzios":[{"name":"DR SERGINHO","votes":4676},{"name":"RODRIGO BACELLAR","votes":1566},{"name":"JORGE FELIPPE NETO","votes":544},{"name":"SUB. TENENTE BERNARDO","votes":516},{"name":"RICARDO DA KAROL","votes":507}],
  "Arraial do Cabo":[{"name":"DR SERGINHO","votes":4523},{"name":"MARCIO CANELLA","votes":1049},{"name":"VITOR JUNIOR","votes":854},{"name":"SUB. TENENTE BERNARDO","votes":771},{"name":"GUSTAVO TUTUCA","votes":693}],
  "Barra do Piraí":[{"name":"GUSTAVO TUTUCA","votes":5686},{"name":"DR. NORIVAL JUNIOR","votes":4828},{"name":"ANDERSON MORAES","votes":2974},{"name":"ANDRE CORREA","votes":2776},{"name":"FABIANI VASCONCELLOS","votes":1752}],
  "Barra Mansa":[{"name":"MARCELO CABELEIREIRO","votes":21104},{"name":"THIAGO VALERIO","votes":5463},{"name":"INES PANDELÓ","votes":5177},{"name":"BETINHO ALBERTASSI","votes":4041},{"name":"GUSTAVO TUTUCA","votes":3023}],
  "Belford Roxo":[{"name":"MARCIO CANELLA","votes":108104},{"name":"DANIELZINHO","votes":11414},{"name":"DR DEODALTO","votes":7673},{"name":"CRISTIANO SANTOS","votes":6259},{"name":"DANIEL LIBRELON","votes":5835}],
  "Bom Jardim":[{"name":"AFFONSO MONNERAT","votes":5723},{"name":"BRUNO BOARETTO","votes":1743},{"name":"WANDERSON NOGUEIRO","votes":452},{"name":"MARCIO CANELLA","votes":254},{"name":"DR SERGINHO","votes":216}],
  "Bom Jesus do Itabapoana":[{"name":"JAIR BITTENCOURT","votes":4464},{"name":"ANDREIA PADUA","votes":1666},{"name":"RODRIGO BACELLAR","votes":1111},{"name":"CLEBINHO","votes":974},{"name":"MARCIO GUALBERTO","votes":855}],
  "Cabo Frio":[{"name":"DR SERGINHO","votes":38049},{"name":"SUB. TENENTE BERNARDO","votes":13757},{"name":"JANIO MENDES","votes":6899},{"name":"CARLOS MACEDO","votes":2013},{"name":"RODRIGO GURGEL","votes":1505}],
  "Cachoeiras de Macacu":[{"name":"DELAROLI","votes":2550},{"name":"JULIO ROCHA","votes":2298},{"name":"ANDRE CORREA","votes":1364},{"name":"CHICO MACHADO","votes":1106},{"name":"FILIPPE POUBEL","votes":1067}],
  "Cambuci":[{"name":"JAIR BITTENCOURT","votes":2183},{"name":"DR FABIO BINHA","votes":1267},{"name":"DR PEDRO RICARDO","votes":695},{"name":"BRUNO DAUAIRE","votes":468},{"name":"DANIEL LUIZ MARTINS","votes":281}],
  "Campos dos Goytacazes":[{"name":"BRUNO DAUAIRE","votes":47542},{"name":"RODRIGO BACELLAR","votes":27407},{"name":"THIAGO RANGEL","votes":20575},{"name":"CARLA MACHADO","votes":17936},{"name":"BRUNO VIANNA","votes":10934}],
  "Cantagalo":[{"name":"BRUNO BOARETTO","votes":2396},{"name":"CIRO FERNANDES","votes":1034},{"name":"RODRIGO BACELLAR","votes":601},{"name":"WELBERT PEDRO","votes":450},{"name":"FRANCIANE MOTTA","votes":396}],
  "Carapebus":[{"name":"JANIO MENDES","votes":2337},{"name":"FRANCIANE MOTTA","votes":917},{"name":"CHICO MACHADO","votes":837},{"name":"GUSTAVO SCHMIDT","votes":421},{"name":"COMTE BITTENCOURT","votes":362}],
  "Cardoso Moreira":[{"name":"RODRIGO BACELLAR","votes":1967},{"name":"MARCIO CANELLA","votes":1312},{"name":"JAIR BITTENCOURT","votes":849},{"name":"VITOR JUNIOR","votes":657},{"name":"BRUNO DAUAIRE","votes":492}],
  "Carmo":[{"name":"DR EMANUEL TORQUATO","votes":1120},{"name":"BRUNO BOARETTO","votes":507},{"name":"ROSENVERG REIS","votes":446},{"name":"DR PEDRO RICARDO","votes":407},{"name":"FRANCIANE MOTTA","votes":405}],
  "Casimiro de Abreu":[{"name":"DR SERGINHO","votes":1625},{"name":"RENAN FINNELON","votes":1203},{"name":"MARCOS ABRAHÃO","votes":872},{"name":"BRUNO DAUAIRE","votes":806},{"name":"JAIR BITTENCOURT","votes":797}],
  "Comendador Levy Gasparian":[{"name":"ROSENVERG REIS","votes":1623},{"name":"EDILAINE DA SAUDE","votes":1084},{"name":"EURICO JUNIOR","votes":503},{"name":"JAIR BITTENCOURT","votes":204},{"name":"DANNIEL LIBRELON","votes":177}],
  "Conceição de Macabu":[{"name":"JOSE MESSIAS","votes":1492},{"name":"CHICO MACHADO","votes":1038},{"name":"JAIR BITTENCOURT","votes":814},{"name":"RODRIGO BACELLAR","votes":594},{"name":"VITOR JUNIOR","votes":590}],
  "Cordeiro":[{"name":"BRUNO BOARETTO","votes":3940},{"name":"DANIEL LUIZ MARTINS","votes":722},{"name":"DR SERGINHO","votes":522},{"name":"MARCIO CANELLA","votes":420},{"name":"DR SALOMAO","votes":374}],
  "Duas Barras":[{"name":"BRUNO BOARETTO","votes":1095},{"name":"CHICO MACHADO","votes":1040},{"name":"ANDRE CORREA","votes":698},{"name":"FRANCIANE MOTTA","votes":521},{"name":"MARCOS ABRAHÃO","votes":298}],
  "Duque de Caxias":[{"name":"ROSENVERG REIS","votes":83387},{"name":"ARTHUR MONTEIRO","votes":21347},{"name":"MARCELO DINO","votes":16157},{"name":"JULIANA DO TAXI","votes":15010},{"name":"WENDELL","votes":16465}],
  "Engenheiro Paulo de Frontin":[{"name":"DR SERGINHO","votes":1567},{"name":"RODRIGO BACELLAR","votes":1130},{"name":"ANDREZINHO CECILIANO","votes":703},{"name":"GUSTAVO TUTUCA","votes":672},{"name":"DR DEODALTO","votes":625}],
  "Guapimirim":[{"name":"JULIO ROCHA","votes":14413},{"name":"VINIVIUS COZZOLINO","votes":1522},{"name":"DR CURY HABIB","votes":713},{"name":"JOAO VICTOR FAMILIA","votes":666},{"name":"RICARDO DA KAROL","votes":501}],
  "Iguaba Grande":[{"name":"COMTE BITTENCOURT","votes":2912},{"name":"JUNIOR NEGÃO","votes":1545},{"name":"MARCIO CANELLA","votes":1088},{"name":"DR SERGINHO","votes":980},{"name":"FRED PACHECO BANDA DOM","votes":739}],
  "Itaboraí":[{"name":"DELAROLI","votes":57503},{"name":"DOUGLAS RUAS","votes":3805},{"name":"RONALDO ANQUIETA","votes":3284},{"name":"CARLOS MACEDO","votes":2405},{"name":"ZEIDAN","votes":2287}],
  "Itaguaí":[{"name":"LUIZ CLAUDIO RIBEIRO","votes":10952},{"name":"KELAINE GOULART","votes":3971},{"name":"DELAROLI","votes":2430},{"name":"FABIO SILVA","votes":2427},{"name":"JESUE ALVES","votes":1885}],
  "Italva":[{"name":"JAIR BITTENCOURT","votes":3419},{"name":"MARCIO CANELLA","votes":639},{"name":"FILIPPE POUBEL","votes":344},{"name":"ANDRE CORREA","votes":265},{"name":"FREDERICO BARBOSA LEMOS","votes":244}],
  "Itaocara":[{"name":"DR FABIO BINHA","votes":3916},{"name":"JAIR BITTENCOURT","votes":2407},{"name":"CATIA SIAS","votes":746},{"name":"RODRIGO BACELLAR","votes":593},{"name":"BRUNO BOARETTO","votes":513}],
  "Itaperuna":[{"name":"JAIR BITTENCOURT","votes":15301},{"name":"KADU NOVAES","votes":6470},{"name":"KEILA DO TOLDO","votes":5040},{"name":"FILIPPE POUBEL","votes":1126},{"name":"VITOR JUNIOR","votes":868}],
  "Itatiaia":[{"name":"TANDE VIEIRA","votes":4561},{"name":"RAFAEL NOBRE","votes":1472},{"name":"FABRICIO DA MUDANÇA","votes":1041},{"name":"GUSTAVO TUTUCA","votes":715},{"name":"BETINHO ALBERTASSI","votes":466}],
  "Japeri":[{"name":"ANDREZINHO CECILIANO","votes":5374},{"name":"DR DEODATO","votes":3784},{"name":"CARLOS JANUARIO","votes":2163},{"name":"TIMOR","votes":1754},{"name":"PROF JOSIMAR MOTA","votes":1629}],
  "Laje do Muriaé":[{"name":"JAIR BITTENCOURT","votes":1579},{"name":"VITOR JUNIOR","votes":328},{"name":"KEILA DO TOLDO","votes":276},{"name":"GIOVANI RATINHO","votes":276},{"name":"DR SERGINHO","votes":244}],
  "Macaé":[{"name":"CHICO MACHADO","votes":17215},{"name":"COMTE BITENCOURT","votes":6120},{"name":"MARCEL SILVANO","votes":5836},{"name":"DANILO FUNKE","votes":4660},{"name":"DR SERGINHO","votes":3811}],
  "Macuco":[{"name":"BRUNO BOARETTO","votes":2444},{"name":"GUSTAVO TUTUCA","votes":621},{"name":"RODRIGO BACELLAR","votes":316},{"name":"CABO WELITON","votes":147},{"name":"BRUNO LESSA","votes":138}],
  "Magé":[{"name":"VINICIUS COZZOLINO","votes":56655},{"name":"RICARDO DA KAROL","votes":9677},{"name":"VANDRO FAMILIA","votes":6785},{"name":"JOAO VICTOR FAMILIA","votes":6418},{"name":"ROSENVERG REIS","votes":3976}],
  "Mangaratiba":[{"name":"LUIZ CLAUDIO RIBEIRO","votes":6449},{"name":"MARCOS MULLER","votes":1463},{"name":"GUSTAVO TUTUCA","votes":912},{"name":"RODRIGO BACELLAR","votes":872},{"name":"BRAZAO","votes":546}],
  "Maricá":[{"name":"RENATO MACHADO","votes":30172},{"name":"ZEIDAN","votes":17778},{"name":"FILIPPE POUBEL","votes":7155},{"name":"DELAROLI","votes":4767},{"name":"DOUGLAS RUAS","votes":2588}],
  "Mendes":[{"name":"ANDREZINHO CECILIANO","votes":2250},{"name":"ANDERSON MORAES","votes":691},{"name":"DR DEODALTO","votes":498},{"name":"GUSTAVO TUTUCA","votes":472},{"name":"ANDRE CORREA","votes":430}],
  "Mesquita":[{"name":"RENATO MIRANDA","votes":34562},{"name":"MARCIO CANELLA","votes":3048},{"name":"CRIS GEMEAS","votes":2623},{"name":"RAFAEL NOBRE","votes":1966},{"name":"ADRIANO ALVES","votes":1828}],
  "Miguel Pereira":[{"name":"EURICO JUNIOR","votes":1884},{"name":"JULINHO JUJU","votes":1593},{"name":"VITOR JOGADOR","votes":789},{"name":"LEO VIEIRA","votes":761},{"name":"DR MARCELO","votes":548}],
  "Miracema":[{"name":"ALESSANDRA FREIRE","votes":3486},{"name":"JAIR BITTENCOURT","votes":1982},{"name":"CELIA JORDAO","votes":965},{"name":"RODRIGO BACELLAR","votes":892},{"name":"VITOR JUNIOR","votes":571}],
  "Natividade":[{"name":"JAIR BITTENCOURT","votes":1346},{"name":"DANIEL LUIZ MARTINS","votes":868},{"name":"MARCELO SIMÃO","votes":597},{"name":"RODRIGO BACELLAR","votes":568},{"name":"WALNEY ROCHA","votes":253}],
  "Nilópolis":[{"name":"RAFAEL NOBRE","votes":22289},{"name":"MARCELO SESSIM","votes":5506},{"name":"RUSSAO GOMES","votes":5449},{"name":"ANDERSON CAMPOS","votes":4538},{"name":"RENATO MIRANDA","votes":3301}],
  "Niterói":[{"name":"FLAVIO SERAFINI","votes":20812},{"name":"VITOR JUNIOR","votes":16718},{"name":"VERONICA LIMA","votes":15652},{"name":"DOUGLAS GOMES","votes":15608},{"name":"COMTE BITTENCOURT","votes":14522}],
  "Nova Friburgo":[{"name":"ZEZINHO DO CAMINHAO","votes":14752},{"name":"WANDERSON NOGUEIRO","votes":13961},{"name":"WELBERT PEDRO","votes":5246},{"name":"MARCOSMARINS","votes":4513},{"name":"BRUNO BOARETTO","votes":4371}],
  "Nova Iguaçu":[{"name":"FELIPINHO RAVIS","votes":33968},{"name":"CARLINHOS BNH","votes":33610},{"name":"ELTON CRISTO","votes":23934},{"name":"VAGUINHO NEGUINHO","votes":15894},{"name":"DELEGADO CARLOS AUGUSTO","votes":10635}],
  "Paracambi":[{"name":"DR DEODATO","votes":7412},{"name":"ANDREZINHO CECILIANO","votes":5286},{"name":"RENATO MIRANDA","votes":1056},{"name":"DR SERGINHO","votes":476},{"name":"DANNIEL LIBRELON","votes":350}],
  "Paraíba do Sul":[{"name":"GISELLE GOBBI","votes":4956},{"name":"RODRIGO BACELLAR","votes":1833},{"name":"EURICO JUNIOR","votes":1416},{"name":"DR SERGINHO","votes":920},{"name":"MARIO SERGIO LEAL CORDEIRO","votes":891}],
  "Paraty":[{"name":"GUSTAVO TUTUCA","votes":4470},{"name":"GIOVANI RATINHO","votes":2073},{"name":"ELOA MORAES","votes":1357},{"name":"CELIA JORDÃO","votes":1069},{"name":"OTONI DE PAULA PAI","votes":499}],
  "Paty do Alferes":[{"name":"EURICO JUNIOR","votes":5292},{"name":"JULINHO JUJU","votes":4154},{"name":"DR MARCELO","votes":795},{"name":"JORGE FELIPPE NETTO","votes":345},{"name":"OTONI DE PAULA PAI","votes":209}],
  "Petrópolis":[{"name":"YURI","votes":22342},{"name":"BERNARDO ROSSI","votes":20984},{"name":"GILDA BEATRIZ","votes":10766},{"name":"ELIAS MONTES","votes":10166},{"name":"OCTAVIO SAMPAIO","votes":10160}],
  "Pinheiral":[{"name":"GUSTAVO TUTUCA","votes":3878},{"name":"GUTO NADER","votes":1031},{"name":"JARI","votes":1015},{"name":"MUNIR NETO","votes":607},{"name":"DR SERGINHO","votes":444}],
  "Piraí":[{"name":"GUSTAVO TUTUCA","votes":8029},{"name":"MUNIR NETO","votes":758},{"name":"DR DEODALTO","votes":554},{"name":"JARI","votes":320},{"name":"DR NORIVAL JUNIOR","votes":319}],
  "Porciúncula":[{"name":"JAIR BITTENCOURT","votes":2879},{"name":"TOSHI","votes":1136},{"name":"FILIPPE POUBEL","votes":571},{"name":"CLAUDIO CAIADO","votes":431},{"name":"VERONICA LIMA","votes":420}],
  "Porto Real":[{"name":"TANDE VIEIRA","votes":3048},{"name":"MARCELO CABELEIREIRO","votes":709},{"name":"ROSENVERG REIS","votes":706},{"name":"LUCIANO AMADEU PROTETOR","votes":596},{"name":"NOEL CARVALHO","votes":501}],
  "Quatis":[{"name":"TANDE VIEIRA","votes":2009},{"name":"GUSTAVO TUTUCA","votes":1051},{"name":"MARCELO CABELEIREIRO","votes":687},{"name":"RODRIGO BACELLAR","votes":274},{"name":"JULIO ROCHA","votes":212}],
  "Queimados":[{"name":"TUNINHO VIRA VIROU","votes":7681},{"name":"MARCIO CANELLA","votes":3217},{"name":"DRA FATIMA","votes":2661},{"name":"WILSON DE TRES FONTES","votes":2336},{"name":"ELTON CRISTO","votes":2188}],
  "Quissamã":[{"name":"JAIR BITTENCOURT","votes":2391},{"name":"CHICO MACHADO","votes":1287},{"name":"ROSENVERG REIS","votes":920},{"name":"FILIPPE POUBEL","votes":811},{"name":"BRUNO DAUAIRE","votes":747}],
  "Resende":[{"name":"TANDE VIEIRA","votes":30182},{"name":"NOEL DE CARVALHO","votes":9811},{"name":"PAULINHO FUTSAL","votes":2137},{"name":"PEDRA","votes":1476},{"name":"THIAGO GAGLIASSO","votes":954}], 
  "Rio Bonito":[{"name":"MARCOS ABRAHÃO","votes":5329},{"name":"MEL CARDOZO","votes":1921},{"name":"BRAZAO","votes":1339},{"name":"JAIR BITTENCOURT","votes":1322},{"name":"DELAROLI","votes":1198}],
  "Rio Claro":[{"name":"MARCELO CABELEIREIRO","votes":1674},{"name":"CELIA JORDAO","votes":1309},{"name":"GUSTAVO TUTUCA","votes":825},{"name":"MUNIR NETO","votes":434},{"name":"BETINHO ALBERTASSI","votes":368}],
  "Rio das Flores":[{"name":"DR SERGINHO","votes":954},{"name":"ANDRE CORREA","votes":377},{"name":"EURICO JUNIOR","votes":367},{"name":"RAFAEL","votes":358},{"name":"JAIR BITTENCOURT","votes":326}],
  "Rio das Ostras":[{"name":"CARVALHAO","votes":5457},{"name":"SABINO","votes":2915},{"name":"DR SERGINHO","votes":1897},{"name":"CHICO MACHADO","votes":1552},{"name":"FILIPPE POUBEL","votes":1490}],
  "Rio de Janeiro":[{"name":"RENATA SOUZA","votes":129717},{"name":"THIAGO GAGLIASSO","votes":66497},{"name":"VAL CEASA","votes":61897},{"name":"GISELLE MONTEIRO","votes":59319},{"name":"LUCINHA","votes":59075}],
  "Santa Maria Madalena":[{"name":"ANDRE CORREA","votes":1062},{"name":"BRUNO BOARETTO","votes":611},{"name":"RODRIGO BACELLAR","votes":446},{"name":"JAIR BITTENCOURT","votes":364},{"name":"CHICO MACHADO","votes":319}],
  "Santo Antônio de Pádua":[{"name":"BETO DA FARMACIA","votes":3763},{"name":"JAIR BITTENCOURT","votes":1894},{"name":"DR SERGINHO","votes":1582},{"name":"DR FABIO BINHA","votes":1461},{"name":"BRUNO DAUAIRE","votes":1152}],
  "São Fidélis":[{"name":"RODRIGO SANTANA","votes":2751},{"name":"JAIR BITTENCOURT","votes":2460},{"name":"RODRIGO BACELLAR","votes":1071},{"name":"BRUNO DAUAIRE","votes":1032},{"name":"DR DEODALTO","votes":807}],
  "São Francisco de Itabapoana":[{"name":"FREDERICO BARBOSA LEMOS","votes":11642},{"name":"RODRIGO BACELLAR","votes":2804},{"name":"CARLA MACHADO","votes":2005},{"name":"THIAGO RANGEL","votes":1931},{"name":"RODOLFO ELIAS","votes":1829}],
  "São Gonçalo":[{"name":"DOUGLAS RUAS","votes":149576},{"name":"PROF JOSEMAR","votes":19323},{"name":"DEJORGE PATRICIO","votes":18863},{"name":"FILIPPE POUBEL","votes":12778},{"name":"CARLOS MACEDO","votes":10389}],
  "São João da Barra":[{"name":"CARLA MACHADO","votes":10929},{"name":"BRUNO DAUAIRE","votes":3642},{"name":"RODRIGO BACELLAR","votes":2565},{"name":"FREDERICO BARBOSA LEMOS","votes":913},{"name":"BRUNO VIANNA","votes":854}],
  "São João de Meriti":[{"name":"VALDECY DA SAUDE","votes":55751},{"name":"LEO VIEIRA","votes":17972},{"name":"MARCOS MULLER","votes":15892},{"name":"MARCELO SIMAO","votes":8303},{"name":"GIOVANI RATINHO","votes":7878}],
  "São José de Ubá":[{"name":"JAIR BITTENCOURT","votes":1548},{"name":"MARCIO CANELLA","votes":1214},{"name":"VITOR JUNIOR","votes":338},{"name":"FRANCIANE MOTTA","votes":290},{"name":"KADU NOVAES","votes":135}],
  "São José do Vale do Rio Preto":[{"name":"LEONARDO VASCONCELLOS","votes":1512},{"name":"FRED PACHECO BANDA DOM","votes":1042},{"name":"MARCELO DINO","votes":594},{"name":"ROSENVERG REIS","votes":580},{"name":"EURICO JUNIOR","votes":454}],
  "São Pedro da Aldeia":[{"name":"DR SERGINHO","votes":9111},{"name":"SUB TENENTE BERNARDO","votes":4750},{"name":"PAULO SANTANA","votes":3789},{"name":"FRANCIANE MOTTA","votes":1564},{"name":"DR PEDRO RICARDO","votes":1341}],
  "São Sebastião do Alto":[{"name":"ANDRE CORREA","votes":1991},{"name":"BRUNO BOARETTO","votes":1364},{"name":"JULIO ROCHA","votes":381},{"name":"JAIR BITTENCOURT","votes":168},{"name":"FRANCIANE MOTTA","votes":164}],
  "Sapucaia":[{"name":"ANDRE CORREA","votes":1394},{"name":"FABRICIO BAIAO","votes":1092},{"name":"EURICO JUNIOR","votes":683},{"name":"RODRIGO AMORIM","votes":511},{"name":"FRANCIANE MOTTA","votes":465}],
  "Saquarema":[{"name":"DR PEDRO RICARDO","votes":20013},{"name":"FRANCIANE MOTTA","votes":7043},{"name":"AMARILDO ORELHA","votes":2684},{"name":"ELISIA RANGEL","votes":1953},{"name":"CARLOS MACEDO","votes":769}],
  "Seropédica":[{"name":"AGUINALDO LUIS","votes":3319},{"name":"DR DEODATO","votes":2303},{"name":"ANDRE CORREA","votes":2211},{"name":"FABIO SILVA","votes":1944},{"name":"DR LUIS CARLOS","votes":1599}],
  "Silva Jardim":[{"name":"DR PEDRO RICARDO","votes":1980},{"name":"MARCOS ABRAHAO","votes":1002},{"name":"DECAROLI","votes":860},{"name":"DR SERGINHO","votes":808},{"name":"RAIANA DE CHIQUINHO","votes":718}],
  "Sumidouro":[{"name":"BRAZAO","votes":1672},{"name":"JAIR BITTENCOURT","votes":1382},{"name":"BERNARDO ROSSI","votes":748},{"name":"ROSENVERG REIS","votes":745},{"name":"DR DEODALTO","votes":466}],
  "Tanguá":[{"name":"DR SERGINHO","votes":2031},{"name":"DELAROLI","votes":1571},{"name":"MARCOS ABRAHÃO","votes":1271},{"name":"BRAZAO","votes":825},{"name":"CARLOS PEREIRA DE TANGUA","votes":669}],
  "Teresópolis":[{"name":"LEONARDO VASCONCELLOS","votes":18210},{"name":"AMOS","votes":5468},{"name":"ANDRE CORREA","votes":4940},{"name":"CAROL QUINTANA","votes":2493},{"name":"MARIA BERTOCHE","votes":2400}],
  "Trajano de Moraes":[{"name":"ANDRE CORREA","votes":1769},{"name":"ROMUALDO WENDEROSCKY","votes":1000},{"name":"BRUNO BOARETTO","votes":736},{"name":"DR SERGINHO","votes":220},{"name":"DANIEL LUIZ MARTINS","votes":180}],
  "Três Rios":[{"name":"JUAREZ DA SAUDE","votes":4514},{"name":"PROFESSOR JACQUESON","votes":4062},{"name":"JOSIMAR SALLES","votes":3941},{"name":"ZIMAR DA DENGUE","votes":2985},{"name":"DR RAFAEL BRASIEL","votes":1502}],
  "Valença":[{"name":"ANDRE CORREA","votes":10375},{"name":"FABIANI VASCONCELLOS","votes":3684},{"name":"FABIO RAMOS","votes":3275},{"name":"DR SERGINHO","votes":982},{"name":"RODRIGO BACELLAR","votes":921}],
  "Varre-Sai":[{"name":"JAIR BITTENCOURT","votes":1151},{"name":"FABRICIO PIMENTEL","votes":883},{"name":"MARIO GUALBERTO","votes":499},{"name":"RODRIGO BACELLAR","votes":411},{"name":"FILIPPE POUBEL","votes":311}],
  "Vassouras":[{"name":"ANDRE CORREA","votes":3525},{"name":"EURICO JUNIOR","votes":3416},{"name":"GUSTAVO TUTUCA","votes":1086},{"name":"JULINHO JUJU","votes":940},{"name":"ANDERSON AMORAES","votes":875}],
  "Volta Redonda":[{"name":"MUNIR NETO","votes":27350},{"name":"JARI","votes":22032},{"name":"RENAN CURY","votes":15517},{"name":"BETINHO ALBERTASSI","votes":13122},{"name":"NELSON GONÇALVES","votes":5291}]
};

/* ===== Regiões oficiais (92 municípios) (mantido) ===== */
const regions = {
  all: null,
  metropolitana: [
    "Rio de Janeiro","Niterói","São Gonçalo","Itaboraí","Maricá","Tanguá","Rio Bonito",
    "Cachoeiras de Macacu","Guapimirim","Magé","Duque de Caxias","Nova Iguaçu","Belford Roxo",
    "São João de Meriti","Nilópolis","Mesquita","Queimados","Japeri","Seropédica","Itaguaí"
  ],
  baixadasLitoraneas: [
    "Araruama","Arraial do Cabo","Cabo Frio","Iguaba Grande","São Pedro da Aldeia",
    "Saquarema","Silva Jardim","Casimiro de Abreu","Rio das Ostras"
  ],
  norteFluminense: [
    "Campos dos Goytacazes","São João da Barra","São Francisco de Itabapoana",
    "Macaé","Carapebus","Quissamã","Conceição de Macabu"
  ],
  noroesteFluminense: [
    "Itaperuna","Bom Jesus do Itabapoana","Natividade","Porciúncula","Varre-Sai",
    "Miracema","Cambuci","Italva","Cardoso Moreira","Laje do Muriaé","Aperibé",
    "Santo Antônio de Pádua","São José de Ubá","Itaocara"
  ],
  serrana: [
    "Petrópolis","Teresópolis","Nova Friburgo","Bom Jardim","Sumidouro","Cantagalo",
    "Cordeiro","Santa Maria Madalena","Trajano de Moraes","São Sebastião do Alto","Macuco"
  ],
  centroSulFluminense: [
    "Paraíba do Sul","Três Rios","Sapucaia","Comendador Levy Gasparian","Areal",
    "Paty do Alferes","Miguel Pereira","Vassouras","Engenheiro Paulo de Frontin",
    "Mendes","Rio Claro","Piraí"
  ],
  medioParaiba: [
    "Barra Mansa","Volta Redonda","Resende","Quatis","Porto Real","Pinheiral",
    "Valença","Rio das Flores","Barra do Piraí"
  ],
  costaVerde: [
    "Angra dos Reis","Paraty","Mangaratiba"
  ]
};