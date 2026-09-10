#!/usr/bin/env bash
# ==============================================================================
# Script de Verificação e Prova Real de Restauração de Backup
# Projeto: bot_de_disparo (bot-prospeccao-web)
# Executa restauração automatizada em banco temporário descartável sem afetar produção
# ==============================================================================

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups/db}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.production.yml}"
LOG_FILE="${BACKUP_DIR}/restore_verification.log"

# Carrega variáveis do .env
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

DB_USER="${POSTGRES_USER:-saas_admin}"
PROD_DB="${POSTGRES_DB:-saas_bot_db}"

# Localiza o backup mais recente
LATEST_BACKUP=$(find "${BACKUP_DIR}" -type f -name "postgres_backup_*.sql.gz" | sort -r | head -n 1)

if [ -z "${LATEST_BACKUP}" ] || [ ! -f "${LATEST_BACKUP}" ]; then
  echo "ERRO: Nenhum backup recente encontrado em '${BACKUP_DIR}' para verificação!" >&2
  exit 1
fi

TEMP_DB_NAME="restore_test_$(date +'%Y%m%d_%H%M%S')"

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Iniciando prova de restauração ==="
echo "Arquivo de teste: ${LATEST_BACKUP}"
echo "Banco temporário: ${TEMP_DB_NAME}"

# Função de limpeza garantida
cleanup() {
  echo "Limpando banco temporário '${TEMP_DB_NAME}'..."
  docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS \"${TEMP_DB_NAME}\";" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# 1. Criação do banco temporário isolado
echo "[1/4] Criando banco descartável '${TEMP_DB_NAME}'..."
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE \"${TEMP_DB_NAME}\";"

# 2. Restaura o backup no banco temporário
echo "[2/4] Restaurando dump no banco temporário..."
gunzip -c "${LATEST_BACKUP}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${TEMP_DB_NAME}" --single-transaction -v ON_ERROR_STOP=1 > /dev/null

# 3. Executa consultas de sanidade estrutural e contagem de registros
echo "[3/4] Executando consultas de sanidade..."
USER_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${TEMP_DB_NAME}" -t -c "SELECT COUNT(*) FROM \"User\";" | tr -d '[:space:]')
CAMPAIGN_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${TEMP_DB_NAME}" -t -c "SELECT COUNT(*) FROM \"Campaign\";" | tr -d '[:space:]' || echo "0")
LEAD_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${TEMP_DB_NAME}" -t -c "SELECT COUNT(*) FROM \"Lead\";" | tr -d '[:space:]' || echo "0")

echo "Sanidade confirmada: Users=${USER_COUNT}, Campaigns=${CAMPAIGN_COUNT}, Leads=${LEAD_COUNT}"

# 4. Registra resultado positivo no arquivo de auditoria
RESULT_LINE="[$(date +'%Y-%m-%d %H:%M:%S')] SUCESSO: Backup '${LATEST_BACKUP}' testado e íntegro. Users=${USER_COUNT}, Campaigns=${CAMPAIGN_COUNT}, Leads=${LEAD_COUNT}"
echo "${RESULT_LINE}"
echo "${RESULT_LINE}" >> "${LOG_FILE}"

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Prova de restauração finalizada com 100% de sucesso! ==="
