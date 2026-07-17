# Backend container for Azure App Service / Container Apps
FROM python:3.11-slim

# System deps for psycopg2 + Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Azure sets $PORT (App Service commonly uses 8000/80; Container Apps uses what you configure).
# Default to 8000 if not provided.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 120 --proxy-headers --forwarded-allow-ips=*"]
