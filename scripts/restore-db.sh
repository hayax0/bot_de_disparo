#!/usr/bin/env bash
# ==============================================================================
# Script de Restauração do PostgreSQL
# Projeto: bot_de_disparo (bot-prospeccao-web)
# ==============================================================================

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.production.yml}"

# Carrega variáveis de ambiente
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

DB_USER="${POSTGRES_USER:-saas_admin}"
DEFAULT_DB="${POSTGRES_DB:-saas_bot_db}"

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <caminho_do_backup.sql.gz> [nome_do_banco_destino]"
  echo "Exemplo: $0 /opt/saas-bot/backups/db/postgres_backup_20260910.sql.gz saas_bot_db"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-${DEFAULT_DB}}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERRO: Arquivo de backup '${BACKUP_FILE}' não encontrado!" >&2
  exit 1
fi

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Iniciando restauração do PostgreSQL ==="
echo "Arquivo: ${BACKUP_FILE}"
echo "Banco de destino: ${TARGET_DB}"

# 1. Valida integridade do arquivo compactado antes de qualquer ação
echo "[1/3] Testando integridade do arquivo gzip..."
gzip -t "${BACKUP_FILE}"

# 2. Confirmação de segurança se o destino for o banco principal de produção
if [ "${TARGET_DB}" = "${DEFAULT_DB}" ] && [ -t 0 ]; then
  read -r -p "ATENÇÃO: Você está prestes a restaurar sobre o banco de produção '${DEFAULT_DB}'! Deseja continuar? [s/N]: " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
    echo "Operação abortada pelo usuário."
    exit 0
  fi
fi

# 3. Executa a restauração via psql
echo "[2/3] Restaurando dump no banco '${TARGET_DB}'..."
gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U "${DB_USER}" -d "${TARGET_DB}" --single-transaction -v ON_ERROR_STOP=1

echo "[3/3] Restauração finalizada com sucesso!"
echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Banco '${TARGET_DB}' restaurado com êxito! ==="
