from google.cloud import bigquery
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "chave.json"

client = bigquery.Client()

query = """
SELECT
  nome_municipio,
  nome_candidato,
  SUM(votos) as votos
FROM `basedosdados.br_tse_eleicoes.detalhes_votacao_municipio`
WHERE ano = 2022
AND nome_municipio = 'ANGRA DOS REIS'
GROUP BY nome_municipio, nome_candidato
ORDER BY votos DESC
LIMIT 10
"""

results = client.query(query)

for row in results:
    print(f"{row.nome_candidato} - {row.votos} votos")