/**
 * tenant.js — Configuração por implantação
 *
 * ⚠️  Edite AMBAS as variáveis ao fazer deploy para um novo tenant.
 *
 * TENANT_ID      → slug de texto usado na tabela tenant_config (ex: 'betao', 'pirai')
 * TENANT_NUM_ID  → id numérico da tabela usuarios (ex: 1, 2, 3...)
 *
 * Exemplos:
 *   Tenant padrão:   TENANT_ID = 'default',  TENANT_NUM_ID = 1
 *   Campanha Betão:  TENANT_ID = 'betao',    TENANT_NUM_ID = 2
 *   Piraí:           TENANT_ID = 'pirai',    TENANT_NUM_ID = 3  (ajuste conforme o banco)
 */
window.TENANT_ID     = 'default';
window.TENANT_NUM_ID = 1;          // tenant_id numérico na tabela usuarios
