# Backend Dockerfile
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Installer systempakker
RUN apt-get update && \
    apt-get install -y curl ffmpeg git python3 python3-pip && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

# Installer Gemini CLI
RUN npm install -g @google/gemini-cli

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
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
