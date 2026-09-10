#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Seguro das Sessões WhatsApp (Baileys Auth)
# Projeto: bot_de_disparo (bot-prospeccao-web)
# ==============================================================================

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups/whatsapp}"
AUTH_DIR="${APP_DIR}/backend/.baileys_auth"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEMP_TAR="${BACKUP_DIR}/baileys_auth_${TIMESTAMP}.tar.gz.tmp"
FINAL_TAR="${BACKUP_DIR}/baileys_auth_${TIMESTAMP}.tar.gz"

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Iniciando backup da sessão WhatsApp ==="
echo "Origem:  ${AUTH_DIR}"
echo "Destino: ${FINAL_TAR}"

if [ ! -d "${AUTH_DIR}" ]; then
  echo "AVISO: Diretório de sessão '${AUTH_DIR}' não existe ou nenhuma sessão foi inicializada ainda. Nada a salvar."
  exit 0
fi

# 1. Empacota e compacta a sessão garantindo que segredos não vazem no stdout
echo "[1/4] Empacotando arquivos de autenticação do Baileys..."
tar -czf "${TEMP_TAR}" -C "$(dirname "${AUTH_DIR}")" "$(basename "${AUTH_DIR}")"

# 2. Valida se o pacote não está vazio
echo "[2/4] Validando integridade do pacote gerado..."
if [ ! -s "${TEMP_TAR}" ]; then
  echo "ERRO: O arquivo compactado de sessão está vazio! Abortando." >&2
  rm -f "${TEMP_TAR}"
  exit 1
fi

# 3. Testa integridade do tar.gz sem listar conteúdo sensível
echo "[3/4] Verificando integridade estrutural do tar..."
if ! tar -tzf "${TEMP_TAR}" > /dev/null 2>&1; then
  echo "ERRO: O arquivo tar.gz da sessão está corrompido! Abortando." >&2
  rm -f "${TEMP_TAR}"
  exit 1
fi

# Move atomicamente e restringe permissões (chmod 600 - dados confidenciais)
mv -f "${TEMP_TAR}" "${FINAL_TAR}"
chmod 600 "${FINAL_TAR}"

SIZE=$(du -h "${FINAL_TAR}" | cut -f1)
echo "Backup da sessão concluído com êxito: ${FINAL_TAR} (${SIZE})"

# 4. Aplica retenção de backups de sessão
echo "[4/4] Aplicando retenção de ${RETENTION_DAYS} dias em ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -type f -name "baileys_auth_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Sessão WhatsApp preservada com segurança! ==="
