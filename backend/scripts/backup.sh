#!/usr/bin/env bash
# Слой бэкапа №3: ежедневный pg_dump в файл (и опц. в S3-совместимое хранилище).
# Запускать по cron, напр.:  0 3 * * *  /app/scripts/backup.sh
#
# Слои защиты (см. docs/SERVER-SETUP.md):
#   1) PITR у провайдера (managed Postgres) — откат к любой точке
#   2) автоснапшоты БД у провайдера (ежедневно)
#   3) ЭТОТ pg_dump в объектное хранилище (внешняя копия)
#   4) версии рабочего стола в самой БД (история на каждое сохранение)
#   5) кнопка «Скачать архив» в интерфейсе у пользователя
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL не задан}"
OUT_DIR="${BACKUP_DIR:-/backups}"
STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
FILE="${OUT_DIR}/svoyakniga-${STAMP}.sql.gz"

mkdir -p "${OUT_DIR}"
echo "Дамп → ${FILE}"
pg_dump "${DATABASE_URL}" | gzip > "${FILE}"

# Необязательно: выгрузка в S3-совместимое хранилище (Yandex/Timeweb/Selectel S3).
# Требует настроенный aws-cli (endpoint провайдера) и S3_BUCKET.
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "Выгрузка в s3://${S3_BUCKET}/"
  aws s3 cp "${FILE}" "s3://${S3_BUCKET}/backups/" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}
fi

# Ретеншн: оставить 30 последних ежедневных дампов локально.
ls -1t "${OUT_DIR}"/svoyakniga-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "Готово."
