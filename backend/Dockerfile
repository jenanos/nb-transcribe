# Backend Dockerfile
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Installer systempakker
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg git python3 python3-pip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Sett arbeidsmappe
WORKDIR /app

# Kopier requirements og installer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopier resten av backend-koden
COPY . .

# Eksponer port 8000
EXPOSE 8000

# Start FastAPI med uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "120"]
