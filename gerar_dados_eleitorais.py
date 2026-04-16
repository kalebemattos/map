"""
═══════════════════════════════════════════════════════════════════
  GERADOR DE DADOS ELEITORAIS — Base dos Dados / BigQuery → JSON
═══════════════════════════════════════════════════════════════════

Consulta as tabelas públicas do TSE disponíveis em basedosdados.io
e gera os arquivos JSON usados pelo analise/index.html.

ARQUIVOS GERADOS (por ano):
  analise/dados/{ano}/resumo.json            → votos por candidato/cidade
  analise/dados/{ano}/eleitorado.json        → perfil do eleitorado por cidade
  analise/dados/{ano}/cidades/{CIDADE}.json  → votos por zona eleitoral (nível bairro)

USO:
  python gerar_dados_eleitorais.py --ano 2022 --projeto SEU_PROJETO_GCP
  python gerar_dados_eleitorais.py --ano 2018 --projeto SEU_PROJETO_GCP
  python gerar_dados_eleitorais.py --ano 2022 2018 2014 2010 --projeto SEU_PROJETO_GCP

  # Somente cidades (mais rápido se resumo.json já existir):
  python gerar_dados_eleitorais.py --ano 2022 --projeto SEU_PROJETO_GCP --apenas-cidades

  # Somente uma cidade específica:
  python gerar_dados_eleitorais.py --ano 2022 --projeto SEU_PROJETO_GCP --cidade "RIO DE JANEIRO"
"""

import argparse
import json
import os
from collections import defaultdict
from google.cloud import bigquery

# ─── Configuração ────────────────────────────────────────────────────────────

UF           = "RJ"
CARGOS_ALVO  = ["DEPUTADO ESTADUAL", "DEPUTADO FEDERAL"]
SAIDA_BASE   = os.path.join(os.path.dirname(__file__), "analise", "dados")

# Nomes de colunas na tabela detalhes_votacao_municipio (Base dos Dados)
# Ref: https://basedosdados.org/dataset/br-tse-eleicoes?table=detalhes_votacao_municipio
COL_ANO        = "ano"
COL_TURNO      = "turno"
COL_UF         = "sigla_uf"
COL_MUNICIPIO  = "nome_municipio"
COL_CARGO      = "cargo"
COL_NOME_URNA  = "nome_urna_candidato"
COL_SEQUENCIAL = "sequencial_candidato"
COL_VOTOS      = "votos"
COL_VOTOS_VAL  = "votos"   # usamos a soma de votos válidos de candidatos

# ─── Helpers ─────────────────────────────────────────────────────────────────

def normalizar(txt: str) -> str:
    return (txt or "").strip().upper()


def salvar_json(caminho: str, dados: dict):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  ✔  {caminho}  ({os.path.getsize(caminho) // 1024} KB)")


# ─── RESUMO.JSON ─────────────────────────────────────────────────────────────
#
# Fontes reais (nenhuma tabela resultados_* tem nome — precisam de JOINs):
#   resultados_candidato_municipio  → votos por candidato/município (sem nomes)
#   candidatos                      → nome_urna por sequencial
#   br_bd_diretorios_brasil.municipio → nome do município por id_municipio
#   detalhes_votacao_municipio      → votos_validos totais por município/cargo

QUERY_RESUMO = """
SELECT
  UPPER(r.cargo)                         AS cargo,
  UPPER(m.nome)                          AS municipio,
  UPPER(c.nome_urna)                     AS nome,
  CAST(r.sequencial_candidato AS STRING) AS sq_candidato,
  SUM(r.votos)                           AS votos
FROM `basedosdados.br_tse_eleicoes.resultados_candidato_municipio` r
LEFT JOIN `basedosdados.br_tse_eleicoes.candidatos` c
  ON  r.sequencial_candidato = c.sequencial
  AND r.ano                  = c.ano
  AND r.sigla_uf             = c.sigla_uf
LEFT JOIN `basedosdados.br_bd_diretorios_brasil.municipio` m
  ON r.id_municipio = m.id_municipio
WHERE r.ano      = @ano
  AND r.turno    = 1
  AND r.sigla_uf = @uf
  AND UPPER(r.cargo) IN UNNEST(@cargos)
  AND r.votos IS NOT NULL
GROUP BY cargo, municipio, nome, sq_candidato
ORDER BY cargo, municipio, votos DESC
"""

# Total de votos válidos por município — usa detalhes_votacao_municipio
QUERY_VALIDOS = """
SELECT
  UPPER(p.cargo)       AS cargo,
  UPPER(m.nome)        AS municipio,
  SUM(p.votos_validos) AS total_validos
FROM `basedosdados.br_tse_eleicoes.detalhes_votacao_municipio` p
LEFT JOIN `basedosdados.br_bd_diretorios_brasil.municipio` m
  ON p.id_municipio = m.id_municipio
WHERE p.ano      = @ano
  AND p.turno    = 1
  AND p.sigla_uf = @uf
  AND UPPER(p.cargo) IN UNNEST(@cargos)
GROUP BY cargo, municipio
"""


def gerar_resumo(client: bigquery.Client, ano: int, projeto: str) -> dict:
    """
    Gera a estrutura:
    {
      "DEPUTADO ESTADUAL": {
        "TOTAL_RJ": 1234567,
        "CIDADES": {
          "RIO DE JANEIRO": {
            "total_validos": 999999,
            "candidatos": [
              {"nome": "FULANO", "sq_candidato": "12345", "votos": 5000, "posicao": 1},
              ...
            ]
          }
        }
      },
      "DEPUTADO FEDERAL": { ... }
    }
    """
    print(f"\n[Resumo {ano}] Consultando votos por candidato/município...")

    params = [
        bigquery.ScalarQueryParameter("ano",   "INT64",  ano),
        bigquery.ScalarQueryParameter("uf",    "STRING", UF),
        bigquery.ArrayQueryParameter("cargos", "STRING", CARGOS_ALVO),
    ]
    job_config = bigquery.QueryJobConfig(
        query_parameters=params,
        default_dataset=f"{projeto}.br_tse_eleicoes" if "." not in projeto else None,
    )

    # ── Busca votos por candidato/município ───────────────────────────────────
    print("  → Buscando votos individuais...")
    rows_votos = list(client.query(QUERY_RESUMO, job_config=job_config).result())
    print(f"  → {len(rows_votos)} linhas recebidas")

    # ── Busca totais válidos por município ────────────────────────────────────
    print("  → Buscando totais válidos...")
    rows_validos = list(client.query(QUERY_VALIDOS, job_config=job_config).result())

    # Indexa totais válidos: cargo → municipio → total
    totais = defaultdict(dict)
    for r in rows_validos:
        totais[normalizar(r.cargo)][normalizar(r.municipio)] = int(r.total_validos or 0)

    # ── Monta estrutura por cargo ─────────────────────────────────────────────
    # cargo → municipio → lista de candidatos (já em ordem decrescente de votos)
    por_cargo = defaultdict(lambda: defaultdict(list))
    for r in rows_votos:
        por_cargo[normalizar(r.cargo)][normalizar(r.municipio)].append({
            "nome":          normalizar(r.nome),
            "sq_candidato":  r.sq_candidato or "0",
            "votos":         int(r.votos or 0),
        })

    resultado = {}
    for cargo, cidades in por_cargo.items():
        if cargo not in CARGOS_ALVO:
            continue

        total_rj   = 0
        cidades_out = {}

        for municipio, candidatos in sorted(cidades.items()):
            # Ordena por votos e atribui posição
            candidatos.sort(key=lambda c: c["votos"], reverse=True)
            for i, c in enumerate(candidatos):
                c["posicao"] = i + 1
                total_rj += c["votos"]

            cidades_out[municipio] = {
                "total_validos": totais[cargo].get(municipio, 0),
                "candidatos":    candidatos,
            }

        resultado[cargo] = {
            "TOTAL_RJ": total_rj,
            "CIDADES":  cidades_out,
        }

    return resultado


# ─── CIDADES/*.JSON (votos por zona eleitoral) ───────────────────────────────
#
# Fonte: resultados_candidato_municipio_zona
#   → votos nominais por candidato, por município e zona eleitoral
# Fonte: detalhes_votacao_municipio_zona
#   → totais de participação por zona (aptos, comparecimento, votos nominais)

# Votos por candidato / município / zona
QUERY_CANDS_ZONA = """
SELECT
  UPPER(r.cargo)                         AS cargo,
  UPPER(m.nome)                          AS municipio,
  r.zona,
  UPPER(c.nome_urna)                     AS nome,
  CAST(r.sequencial_candidato AS STRING) AS sq_candidato,
  SUM(r.votos)                           AS votos
FROM `basedosdados.br_tse_eleicoes.resultados_candidato_municipio_zona` r
LEFT JOIN `basedosdados.br_tse_eleicoes.candidatos` c
  ON  r.sequencial_candidato = c.sequencial
  AND r.ano                  = c.ano
  AND r.sigla_uf             = c.sigla_uf
LEFT JOIN `basedosdados.br_bd_diretorios_brasil.municipio` m
  ON r.id_municipio = m.id_municipio
WHERE r.ano      = @ano
  AND r.turno    = 1
  AND r.sigla_uf = @uf
  AND UPPER(r.cargo) IN UNNEST(@cargos)
  AND r.votos IS NOT NULL
GROUP BY cargo, municipio, zona, nome, sq_candidato
ORDER BY cargo, municipio, zona, votos DESC
"""

# Totais de participação por zona — votos_nominais e aptos/comparecimento
QUERY_PART_ZONA = """
SELECT
  UPPER(p.cargo)        AS cargo,
  UPPER(m.nome)         AS municipio,
  p.zona,
  SUM(p.votos_nominais) AS total_validos,
  SUM(p.aptos)          AS aptos,
  SUM(p.comparecimento) AS comparecimento
FROM `basedosdados.br_tse_eleicoes.detalhes_votacao_municipio_zona` p
LEFT JOIN `basedosdados.br_bd_diretorios_brasil.municipio` m
  ON p.id_municipio = m.id_municipio
WHERE p.ano      = @ano
  AND p.turno    = 1
  AND p.sigla_uf = @uf
  AND UPPER(p.cargo) IN UNNEST(@cargos)
GROUP BY cargo, municipio, zona
"""


def _nome_arquivo_cidade(nome: str) -> str:
    """Converte nome de cidade para nome de arquivo: 'Rio de Janeiro' → 'RIO_DE_JANEIRO'."""
    return nome.upper().replace(" ", "_")


def gerar_cidades(client: bigquery.Client, ano: int, projeto: str,
                  cidade_filtro: str | None = None):
    """
    Gera um JSON por cidade em analise/dados/{ano}/cidades/{CIDADE}.json.

    Fonte: resultados_candidato_municipio_zona  (votos por candidato/zona)
           detalhes_votacao_municipio_zona      (participação por zona)

    Estrutura de cada arquivo:
    {
      "DEPUTADO ESTADUAL": {
        "CIDADES": {
          "RIO DE JANEIRO": {
            "total_validos": 999999,
            "BAIRROS": {
              "0001": {
                "total_validos": 5000,
                "aptos": 8000,
                "comparecimento": 6000,
                "candidatos": [
                  {"nome": "FULANO", "sq_candidato": "12345", "votos": 300, "posicao": 1},
                  ...
                ]
              },
              ...
            }
          }
        }
      }
    }
    """
    print(f"\n[Cidades {ano}] Consultando votos por zona eleitoral...")
    if cidade_filtro:
        print(f"  → Filtro de cidade: {cidade_filtro}")

    params = [
        bigquery.ScalarQueryParameter("ano",   "INT64",  ano),
        bigquery.ScalarQueryParameter("uf",    "STRING", UF),
        bigquery.ArrayQueryParameter("cargos", "STRING", CARGOS_ALVO),
    ]
    job_config = bigquery.QueryJobConfig(query_parameters=params)

    # ── 1. Votos por candidato / zona ─────────────────────────────────────────
    print("  → Buscando votos por candidato/zona (resultados_candidato_municipio_zona)...")
    rows_votos = list(client.query(QUERY_CANDS_ZONA, job_config=job_config).result())
    print(f"  → {len(rows_votos)} linhas recebidas")

    # ── 2. Participação por zona ──────────────────────────────────────────────
    print("  → Buscando participação por zona (detalhes_votacao_municipio_zona)...")
    try:
        rows_part = list(client.query(QUERY_PART_ZONA, job_config=job_config).result())
        print(f"  → {len(rows_part)} linhas de participação recebidas")
    except Exception as e:
        print(f"  ⚠  Tabela de participação não disponível: {e}")
        rows_part = []

    # ── 3. Indexa participação: cargo → municipio → zona → {total, aptos, comp}
    part: dict = defaultdict(lambda: defaultdict(dict))
    for r in rows_part:
        cargo = normalizar(r.cargo)
        mun   = normalizar(r.municipio)
        zona  = str(r.zona).strip()
        part[cargo][mun][zona] = {
            "total_validos":  int(r.total_validos  or 0),
            "aptos":          int(r.aptos          or 0),
            "comparecimento": int(r.comparecimento or 0),
        }

    # ── 4. Monta estrutura: cargo → municipio → zona → candidatos ────────────
    por_cargo: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for r in rows_votos:
        cargo = normalizar(r.cargo)
        mun   = normalizar(r.municipio)
        zona  = str(r.zona).strip()
        if cargo not in CARGOS_ALVO:
            continue
        por_cargo[cargo][mun][zona].append({
            "nome":         normalizar(r.nome),
            "sq_candidato": r.sq_candidato or "0",
            "votos":        int(r.votos or 0),
        })

    # ── 5. Coleta cidades únicas (com filtro opcional) ────────────────────────
    todas_cidades: set = set()
    for cargo_data in por_cargo.values():
        todas_cidades.update(cargo_data.keys())

    if cidade_filtro:
        filtro_norm = normalizar(cidade_filtro)
        todas_cidades = {c for c in todas_cidades if normalizar(c) == filtro_norm}

    pasta_cidades = os.path.join(SAIDA_BASE, str(ano), "cidades")
    os.makedirs(pasta_cidades, exist_ok=True)

    print(f"\n  Gerando JSONs para {len(todas_cidades)} cidades...")

    # ── 6. Um JSON por cidade ─────────────────────────────────────────────────
    for cidade in sorted(todas_cidades):
        cidade_out: dict = {}

        for cargo in CARGOS_ALVO:
            zonas_cidade = por_cargo[cargo].get(cidade, {})
            if not zonas_cidade:
                continue

            bairros_out: dict = {}
            total_validos_cidade = 0

            for zona, candidatos in sorted(zonas_cidade.items()):
                # Ordena candidatos por votos e atribui posição dentro da zona
                candidatos.sort(key=lambda c: c["votos"], reverse=True)
                for i, c in enumerate(candidatos):
                    c["posicao"] = i + 1

                # Dados de participação da zona (fallback: soma dos candidatos)
                info_part = part[cargo][cidade].get(zona, {})
                total_zona = info_part.get("total_validos") or sum(c["votos"] for c in candidatos)
                total_validos_cidade += total_zona

                bairros_out[zona] = {
                    "total_validos":  total_zona,
                    "aptos":          info_part.get("aptos", 0),
                    "comparecimento": info_part.get("comparecimento", 0),
                    "candidatos":     candidatos,
                }

            cidade_out[cargo] = {
                "CIDADES": {
                    cidade: {
                        "total_validos": total_validos_cidade,
                        "BAIRROS":       bairros_out,
                    }
                }
            }

        if not cidade_out:
            continue

        nome_arq = _nome_arquivo_cidade(cidade) + ".json"
        salvar_json(os.path.join(pasta_cidades, nome_arq), cidade_out)

    print(f"\n  ✔  {len(todas_cidades)} arquivos gerados em {pasta_cidades}/")


# ─── ELEITORADO.JSON ──────────────────────────────────────────────────────────

QUERY_ELEITORADO = """
SELECT
  UPPER(nome_municipio)   AS municipio,
  genero,
  faixa_etaria,
  estado_civil,
  grau_escolaridade       AS escolaridade,
  SUM(quantidade_eleitores_perfil) AS total
FROM `basedosdados.br_tse_eleicoes.perfil_eleitorado`
WHERE ano      = @ano
  AND sigla_uf = @uf
GROUP BY municipio, genero, faixa_etaria, estado_civil, escolaridade
ORDER BY municipio, total DESC
"""


def gerar_eleitorado(client: bigquery.Client, ano: int) -> dict:
    """
    Gera a estrutura:
    {
      "RIO DE JANEIRO": {
        "genero":       {"FEMININO": 123, "MASCULINO": 456},
        "faixa_etaria": {"16 a 17 anos": 100, ...},
        "estado_civil": {"CASADO": 200, ...},
        "escolaridade": {"ENSINO MÉDIO COMPLETO": 300, ...}
      },
      ...
    }
    """
    print(f"\n[Eleitorado {ano}] Consultando perfil do eleitorado...")

    params = [
        bigquery.ScalarQueryParameter("ano", "INT64",  ano),
        bigquery.ScalarQueryParameter("uf",  "STRING", UF),
    ]
    job_config = bigquery.QueryJobConfig(query_parameters=params)

    try:
        rows = list(client.query(QUERY_ELEITORADO, job_config=job_config).result())
        print(f"  → {len(rows)} linhas recebidas")
    except Exception as e:
        print(f"  ⚠  Tabela perfil_eleitorado não disponível para {ano}: {e}")
        return {}

    # Agrega por município e dimensão
    dados: dict[str, dict[str, dict[str, int]]] = defaultdict(lambda: {
        "genero": defaultdict(int),
        "faixa_etaria": defaultdict(int),
        "estado_civil": defaultdict(int),
        "escolaridade": defaultdict(int),
    })

    for r in rows:
        mun = normalizar(r.municipio)
        total = int(r.total or 0)

        if r.genero:
            dados[mun]["genero"][normalizar(r.genero)] += total
        if r.faixa_etaria:
            dados[mun]["faixa_etaria"][normalizar(r.faixa_etaria)] += total
        if r.estado_civil:
            dados[mun]["estado_civil"][normalizar(r.estado_civil)] += total
        if r.escolaridade:
            dados[mun]["escolaridade"][normalizar(r.escolaridade)] += total

    # Converte defaultdicts para dicts normais (para JSON serializable)
    return {
        mun: {dim: dict(valores) for dim, valores in dims.items()}
        for mun, dims in dados.items()
    }


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def processar_ano(client: bigquery.Client, ano: int, projeto: str,
                  apenas_cidades: bool = False, cidade_filtro: str | None = None):
    print(f"\n{'═'*60}")
    print(f"  Processando ano {ano} | UF {UF}")
    print(f"{'═'*60}")

    pasta = os.path.join(SAIDA_BASE, str(ano))
    os.makedirs(pasta, exist_ok=True)

    if not apenas_cidades:
        # 1. Resumo (votos por candidato/município)
        resumo = gerar_resumo(client, ano, projeto)
        salvar_json(os.path.join(pasta, "resumo.json"), resumo)

        # 2. Eleitorado (perfil do eleitorado por município)
        eleitorado = gerar_eleitorado(client, ano)
        salvar_json(os.path.join(pasta, "eleitorado.json"), eleitorado)

        # Resumo rápido
        for cargo, dados in resumo.items():
            ncidades = len(dados["CIDADES"])
            ncands   = len({c["nome"] for v in dados["CIDADES"].values() for c in v["candidatos"]})
            print(f"\n  {cargo}: {ncidades} municípios, {ncands} candidatos únicos")

    # 3. Cidades (votos por zona eleitoral — nível bairro)
    gerar_cidades(client, ano, projeto, cidade_filtro=cidade_filtro)


def main():
    parser = argparse.ArgumentParser(
        description="Gera dados eleitorais do TSE (Base dos Dados / BigQuery) para o analise/index.html"
    )
    parser.add_argument("--ano",     nargs="+", type=int, default=[2022],
                        help="Ano(s) a processar (ex: --ano 2022 2018 2014 2010)")
    parser.add_argument("--projeto", default="paralax-eleicoes",
                        help="ID do projeto Google Cloud (padrão: paralax-eleicoes)")
    parser.add_argument("--apenas-cidades", action="store_true",
                        help="Pula resumo.json e eleitorado.json — gera somente os JSONs de cidades/zonas")
    parser.add_argument("--cidade",  default=None,
                        help="Gera somente o JSON de uma cidade (ex: --cidade 'RIO DE JANEIRO')")
    args = parser.parse_args()

    print(f"\n🗳  Gerador de Dados Eleitorais — TSE / Base dos Dados")
    print(f"   Projeto GCP    : {args.projeto}")
    print(f"   UF             : {UF}")
    print(f"   Anos           : {args.ano}")
    print(f"   Apenas cidades : {args.apenas_cidades}")
    if args.cidade:
        print(f"   Cidade filtro  : {args.cidade}")
    print(f"   Saída          : {SAIDA_BASE}\n")

    # Cria cliente BigQuery usando credenciais da Application Default
    client = bigquery.Client(project=args.projeto)

    for ano in args.ano:
        processar_ano(client, ano, args.projeto,
                      apenas_cidades=args.apenas_cidades,
                      cidade_filtro=args.cidade)

    print(f"\n\n✅  Concluído! Abra analise/index.html para ver os dados.\n")


if __name__ == "__main__":
    main()
