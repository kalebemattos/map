-- ═══════════════════════════════════════════════════════════════════════════
--  MIGRAÇÃO: LIDERANÇAS — ENTIDADE ÚNICA + MANY-TO-MANY COM CIDADES
--  Execute em ordem. Em produção, teste em staging primeiro.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — Extensões necessárias
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;   -- remove acentos no PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- índice trigram para autocomplete

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Tabela "pessoas" (entidade canônica, não duplicada)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada pessoa existe UMA VEZ por tenant, independente de quantas
-- cidades ela atua.

CREATE TABLE IF NOT EXISTS public.pessoas (
  id               SERIAL       PRIMARY KEY,
  tenant_id        INTEGER      NOT NULL,

  -- Nome original (exibição)
  nome             TEXT         NOT NULL,
  -- Nome normalizado: sem acentos, minúsculo, sem espaços extras
  -- É calculado pela aplicação e armazenado para índice único
  nome_norm        TEXT         NOT NULL,

  -- Dados pessoais (pertencem à pessoa, não à cidade)
  contato          TEXT,
  foto             TEXT,                      -- URL Supabase Storage
  perfil           TEXT,                      -- bairro/descrição pessoal
  data_nascimento  DATE,
  release          TEXT,

  criado_em        TIMESTAMPTZ  DEFAULT now(),
  atualizado_em    TIMESTAMPTZ  DEFAULT now(),

  -- GARANTIA: mesma pessoa não pode existir duas vezes no mesmo tenant
  CONSTRAINT uq_pessoa_tenant UNIQUE (tenant_id, nome_norm)
);

-- Índice trigram: permite busca fuzzy rápida ("Chapin" acha "Chapinha")
CREATE INDEX IF NOT EXISTS idx_pessoas_nome_trgm
  ON public.pessoas USING gin (nome_norm gin_trgm_ops);

-- Índice normal: filtro por tenant
CREATE INDEX IF NOT EXISTS idx_pessoas_tenant
  ON public.pessoas (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 3 — Adiciona pessoa_id na tabela liderancas existente
-- ─────────────────────────────────────────────────────────────────────────────
-- A tabela liderancas passa a ser a junção: pessoa ↔ cidade
-- (mantemos os dados originais por segurança até limpar na etapa final)

ALTER TABLE public.liderancas
  ADD COLUMN IF NOT EXISTS pessoa_id INTEGER
    REFERENCES public.pessoas(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 4 — MIGRAÇÃO DE DADOS (agrupa por nome normalizado por tenant)
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Cria função auxiliar de normalização (só para a migração)
CREATE OR REPLACE FUNCTION _migr_norm(txt TEXT) RETURNS TEXT AS $$
  SELECT lower(trim(unaccent(txt)));
$$ LANGUAGE SQL IMMUTABLE;

-- 4b. Insere uma linha em "pessoas" para cada nome único por tenant
--     Em caso de duplicatas, usa os dados do registro mais antigo
INSERT INTO public.pessoas
  (tenant_id, nome, nome_norm, contato, foto, perfil, data_nascimento, release)
SELECT DISTINCT ON (tenant_id, _migr_norm(nome))
  tenant_id,
  trim(nome)            AS nome,
  _migr_norm(nome)      AS nome_norm,
  contato,
  foto,
  perfil,
  data_nascimento,
  release
FROM public.liderancas
WHERE nome IS NOT NULL
  AND trim(nome) != ''
ORDER BY tenant_id, _migr_norm(nome), createdat ASC   -- mais antigo ganha
ON CONFLICT (tenant_id, nome_norm) DO NOTHING;

-- 4c. Liga cada linha de liderancas à sua pessoa correspondente
UPDATE public.liderancas l
SET pessoa_id = p.id
FROM public.pessoas p
WHERE p.tenant_id = l.tenant_id
  AND p.nome_norm = _migr_norm(l.nome);

-- 4d. Verifica se ficou algum registro sem pessoa_id (não deve)
-- SELECT COUNT(*) FROM liderancas WHERE pessoa_id IS NULL;

-- Remove função auxiliar temporária
DROP FUNCTION IF EXISTS _migr_norm(TEXT);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 5 — Aplica restrições definitivas
-- (só execute após confirmar que todas as linhas têm pessoa_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- Torna pessoa_id obrigatório
ALTER TABLE public.liderancas
  ALTER COLUMN pessoa_id SET NOT NULL;

-- Impede que a mesma pessoa apareça na mesma cidade duas vezes no mesmo tenant
ALTER TABLE public.liderancas
  ADD CONSTRAINT IF NOT EXISTS uq_lideranca_pessoa_cidade
  UNIQUE (pessoa_id, cidade, tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 6 — Remove colunas redundantes de liderancas
-- (os dados pessoais agora vivem em "pessoas")
-- ATENÇÃO: só execute depois de confirmar que o código novo está em produção
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS nome;
-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS contato;
-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS foto;
-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS perfil;
-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS data_nascimento;
-- ALTER TABLE public.liderancas DROP COLUMN IF EXISTS release;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 7 — View de conveniência (compatibilidade retroativa)
-- Retorna os dados "achatados" como antes, para não quebrar código legado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_liderancas AS
SELECT
  l.id,
  l.tenant_id,
  l.cidade,
  l.regiao,
  l.mapa,
  l.expectativa_votos,
  l.status,
  l.responsavel,
  l.vinculo_politico,
  l.createdat,
  l.pessoa_id,
  -- Dados pessoais vindos de "pessoas"
  p.nome,
  p.contato,
  p.foto,
  p.perfil,
  p.data_nascimento,
  p.release
FROM public.liderancas l
JOIN public.pessoas p ON p.id = l.pessoa_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONSULTAS ÚTEIS PÓS-MIGRAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────

-- Lideranças únicas por tenant (evita contar duplicatas)
-- SELECT tenant_id, COUNT(*) AS total_pessoas FROM pessoas GROUP BY tenant_id;

-- Pessoas que atuam em mais de uma cidade
-- SELECT p.nome, COUNT(l.cidade) AS qtd_cidades, ARRAY_AGG(l.cidade) AS cidades
-- FROM pessoas p JOIN liderancas l ON l.pessoa_id = p.id
-- WHERE l.tenant_id = $1
-- GROUP BY p.id HAVING COUNT(l.cidade) > 1;

-- Detecta duplicatas restantes (sanity check)
-- SELECT nome_norm, tenant_id, COUNT(*) FROM pessoas
-- GROUP BY nome_norm, tenant_id HAVING COUNT(*) > 1;
