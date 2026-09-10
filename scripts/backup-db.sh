#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Automatizado do PostgreSQL
# Projeto: bot_de_disparo (bot-prospeccao-web)
# ==============================================================================

set -Eeuo pipefail

# Configuração via variáveis de ambiente com fallbacks seguros
APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups/db}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.production.yml}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Garante a existência do diretório de backup com permissão restrita
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEMP_BACKUP="${BACKUP_DIR}/postgres_backup_${TIMESTAMP}.sql.tmp"
FINAL_BACKUP="${BACKUP_DIR}/postgres_backup_${TIMESTAMP}.sql.gz"

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Iniciando backup do PostgreSQL ==="
echo "Diretório da aplicação: ${APP_DIR}"
echo "Destino do backup:      ${FINAL_BACKUP}"

# Carrega variáveis do arquivo .env caso existam
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1091
  set -a
  source "${APP_DIR}/.env"
  set +a
fi

DB_USER="${POSTGRES_USER:-saas_admin}"
DB_NAME="${POSTGRES_DB:-saas_bot_db}"

# 1. Executa o dump dentro do container do postgres para arquivo temporário
echo "[1/5] Gerando dump SQL do banco '${DB_NAME}'..."
docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_dump -U "${DB_USER}" "${DB_NAME}" > "${TEMP_BACKUP}"

# 2. Valida se o arquivo gerado não está vazio
echo "[2/5] Validando integridade do arquivo gerado..."
if [ ! -s "${TEMP_BACKUP}" ]; then
  echo "ERRO: O dump do PostgreSQL está vazio! Abortando." >&2
  rm -f "${TEMP_BACKUP}"
  exit 1
fi

# 3. Compacta o dump usando gzip
echo "[3/5] Compactando dump com gzip..."
gzip -f "${TEMP_BACKUP}"
GZ_TEMP="${TEMP_BACKUP}.gz"

# 4. Testa a integridade do arquivo compactado e renomeia atomicamente
echo "[4/5] Testando integridade do gzip..."
if ! gzip -t "${GZ_TEMP}"; then
  echo "ERRO: O arquivo compactado está corrompido! Abortando." >&2
  rm -f "${GZ_TEMP}"
  exit 1
fi

# Renomeia atomicamente para o nome final
mv -f "${GZ_TEMP}" "${FINAL_BACKUP}"
chmod 600 "${FINAL_BACKUP}"

BACKUP_SIZE=$(du -h "${FINAL_BACKUP}" | cut -f1)
echo "Backup gerado com sucesso: ${FINAL_BACKUP} (${BACKUP_SIZE})"

# 5. Política de retenção de backups antigos (apenas dentro do diretório validado)
echo "[5/5] Aplicando retenção de ${RETENTION_DAYS} dias em ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -type f -name "postgres_backup_*.sql.gz" -mtime +"${RETENTION_DAYS}" -print -delete

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Backup concluído com sucesso! ==="
