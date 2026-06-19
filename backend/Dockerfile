# Бэкенд «СвояКнига»: FastAPI + taxcore + аккаунты/БД.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

# Системные зависимости для argon2 / psycopg сборки минимальны (бинарные колёса),
# но оставим build-essential на случай отсутствия колёс под платформу.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt && pip install "psycopg[binary]==3.2.3"

# Код: пакеты app/ и taxcore/ (импортируются как app.main и taxcore)
COPY app ./app
COPY taxcore ./taxcore

EXPOSE 8000
# uvicorn слушает 0.0.0.0; число воркеров можно поднять под нагрузку.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
