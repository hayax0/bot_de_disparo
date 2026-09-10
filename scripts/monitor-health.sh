#!/usr/bin/env bash
# ==============================================================================
# Script de Monitoramento Operacional da VPS e SaaS Bot
# Projeto: bot_de_disparo (bot-prospeccao-web)
# Executado periodicamente via cron (ex: a cada 5 ou 10 minutos)
# ==============================================================================

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.production.yml}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups/db}"
HEALTH_URL="http://127.0.0.1:3001/api/health/ready"
DISK_ALERT_THRESHOLD=85

echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Verificação de Saúde da Infraestrutura ==="

ERRORS=0

# 1. Checa status dos containers Docker
echo "[1/5] Verificando containers em execução..."
RUNNING_CONTAINERS=$(docker compose -f "${COMPOSE_FILE}" ps --status running -q | wc -l | tr -d ' ')
if [ "${RUNNING_CONTAINERS}" -lt 4 ]; then
  echo "ALERTA: Menos de 4 containers ativos no docker compose! (Ativos: ${RUNNING_CONTAINERS})" >&2
  ERRORS=$((ERRORS + 1))
fi

# 2. Checa endpoint de readiness da API (Postgres, Redis e Worker Heartbeat)
echo "[2/5] Consultando endpoint de saúde da API (${HEALTH_URL})..."
HEALTH_RESPONSE=$(curl -s -m 10 "${HEALTH_URL}" || echo "")

if [ -z "${HEALTH_RESPONSE}" ]; then
  echo "ALERTA: Endpoint de saúde da API não respondeu dentro de 10s!" >&2
  ERRORS=$((ERRORS + 1))
else
  STATUS=$(echo "${HEALTH_RESPONSE}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  if [ "${STATUS}" != "healthy" ]; then
    echo "ALERTA: API reportou status degradado: ${HEALTH_RESPONSE}" >&2
    ERRORS=$((ERRORS + 1))
  else
    echo "Saúde da aplicação: OK (healthy)"
  fi
fi

# 3. Checa uso de espaço em disco na VPS
echo "[3/5] Verificando espaço em disco..."
DISK_USAGE=$(df -P "${APP_DIR}" | awk 'NR==2 {gsub("%",""); print $5}')
echo "Uso de disco atual: ${DISK_USAGE}%"
if [ "${DISK_USAGE}" -gt "${DISK_ALERT_THRESHOLD}" ]; then
  echo "ALERTA CRÍTICO: Espaço em disco acima de ${DISK_ALERT_THRESHOLD}%! (${DISK_USAGE}%)" >&2
  ERRORS=$((ERRORS + 1))
fi

# 4. Checa existência de backup diário recente do PostgreSQL (< 26 horas)
echo "[4/5] Conferindo data do último backup diário..."
LATEST_BACKUP=$(find "${BACKUP_DIR}" -type f -name "postgres_backup_*.sql.gz" | sort -r | head -n 1)

if [ -z "${LATEST_BACKUP}" ]; then
  echo "ALERTA: Nenhum arquivo de backup encontrado em '${BACKUP_DIR}'!" >&2
  ERRORS=$((ERRORS + 1))
else
  # Verifica se o arquivo foi modificado há mais de 26 horas (93600 segundos)
  BACKUP_MTIME=$(stat -c %Y "${LATEST_BACKUP}" 2>/dev/null || stat -f %m "${LATEST_BACKUP}")
  NOW=$(date +%s)
  AGE_HOURS=$(( (NOW - BACKUP_MTIME) / 3600 ))
  echo "Último backup: $(basename "${LATEST_BACKUP}") há ${AGE_HOURS}h"
  if [ "${AGE_HOURS}" -gt 26 ]; then
    echo "ALERTA: O último backup tem mais de 26 horas (${AGE_HOURS}h)! Falha no agendador diário." >&2
    ERRORS=$((ERRORS + 1))
  fi
fi

# 5. Checa última validação de restauração (< 8 dias)
echo "[5/5] Conferindo prova real de restauração (auditoria)..."
RESTORE_LOG="${BACKUP_DIR}/restore_verification.log"
if [ ! -f "${RESTORE_LOG}" ]; then
  echo "AVISO: Log de verificação de restauração ainda não criado. Execute 'verify-backup.sh'."
else
  LAST_SUCCESS=$(grep "SUCESSO" "${RESTORE_LOG}" | tail -n 1 || echo "")
  if [ -z "${LAST_SUCCESS}" ]; then
    echo "ALERTA: Nenhuma prova de restauração com sucesso registrada!" >&2
    ERRORS=$((ERRORS + 1))
  else
    echo "Última restauração validada: ${LAST_SUCCESS}"
  fi
fi

if [ "${ERRORS}" -gt 0 ]; then
  echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Monitoramento concluído com ${ERRORS} alertas detectados! ==="
  exit 1
else
  echo "=== [$(date +'%Y-%m-%d %H:%M:%S')] Todos os sistemas operacionais e saudáveis. ==="
  exit 0
fi
