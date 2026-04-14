"""
═══════════════════════════════════════════════════════════════════
  GERADOR DE DADOS ELEITORAIS — Base dos Dados / BigQuery → JSON
═══════════════════════════════════════════════════════════════════

Consulta as tabelas públicas do TSE disponíveis em basedosdados.io
e gera os arquivos JSON usados pelo analise/index.html.

ARQUIVOS GERADOS (por ano):
  analise/dados/{ano}/resumo.json       → votos por candidato/cidade
  analise/dados/{ano}/eleitorado.json   → perfil do eleitorado por cidade

USO:
  python gerar_dados_eleitorais.py --ano 2022 --projeto SEU_PROJETO_GCP
  python gerar_dados_eleitorais.py --ano 2018 --projeto SEU_PROJETO_GCP
  python gerar_dados_eleitorais.py --ano 2022 2018 2014 2010 --projeto SEU_PROJETO_GCP
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

QUERY_RESUMO = """
SELECT
  {col_cargo}                       AS cargo,
  UPPER({col_municipio})            AS municipio,
  UPPER({col_nome_urna})            AS nome,
  CAST({col_sequencial} AS STRING)  AS sq_candidato,
  SUM({col_votos})                  AS votos
FROM `basedosdados.br_tse_eleicoes.detalhes_votacao_municipio`
WHERE {col_ano}   = @ano
  AND {col_turno} = 1
  AND {col_uf}    = @uf
  AND UPPER({col_cargo}) IN UNNEST(@cargos)
  AND {col_votos} IS NOT NULL
GROUP BY cargo, municipio, nome, sq_candidato
ORDER BY cargo, municipio, votos DESC
""".format(
    col_cargo      = COL_CARGO,
    col_municipio  = COL_MUNICIPIO,
    col_nome_urna  = COL_NOME_URNA,
    col_sequencial = COL_SEQUENCIAL,
    col_votos      = COL_VOTOS,
    col_ano        = COL_ANO,
    col_turno      = COL_TURNO,
    col_uf         = COL_UF,
)

# Consulta separada para total de votos válidos por município
# (usamos a soma de todos os candidatos como proxy de votos válidos)
QUERY_VALIDOS = """
SELECT
  UPPER({col_cargo})       AS cargo,
  UPPER({col_municipio})   AS municipio,
  SUM({col_votos})         AS total_validos
FROM `basedosdados.br_tse_eleicoes.detalhes_votacao_municipio`
WHERE {col_ano}   = @ano
  AND {col_turno} = 1
  AND {col_uf}    = @uf
  AND UPPER({col_cargo}) IN UNNEST(@cargos)
  AND {col_votos} IS NOT NULL
GROUP BY cargo, municipio
""".format(
    col_cargo     = COL_CARGO,
    col_municipio = COL_MUNICIPIO,
    col_votos     = COL_VOTOS,
    col_ano       = COL_ANO,
    col_turno     = COL_TURNO,
    col_uf        = COL_UF,
)


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

def processar_ano(client: bigquery.Client, ano: int, projeto: str):
    print(f"\n{'═'*60}")
    print(f"  Processando ano {ano} | UF {UF}")
    print(f"{'═'*60}")

    pasta = os.path.join(SAIDA_BASE, str(ano))
    os.makedirs(pasta, exist_ok=True)

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


def main():
    parser = argparse.ArgumentParser(
        description="Gera dados eleitorais do TSE (Base dos Dados / BigQuery) para o analise/index.html"
    )
    parser.add_argument("--ano",     nargs="+", type=int, default=[2022],
                        help="Ano(s) a processar (ex: --ano 2022 2018 2014 2010)")
    parser.add_argument("--projeto", required=True,
                        help="ID do seu projeto Google Cloud (ex: meu-projeto-123)")
    args = parser.parse_args()

    print(f"\n🗳  Gerador de Dados Eleitorais — TSE / Base dos Dados")
    print(f"   Projeto GCP : {args.projeto}")
    print(f"   UF          : {UF}")
    print(f"   Anos        : {args.ano}")
    print(f"   Saída       : {SAIDA_BASE}\n")

    # Cria cliente BigQuery usando credenciais da Application Default
    client = bigquery.Client(project=args.projeto)

    for ano in args.ano:
        processar_ano(client, ano, args.projeto)

    print(f"\n\n✅  Concluído! Abra analise/index.html para ver os dados.\n")


if __name__ == "__main__":
    main()
