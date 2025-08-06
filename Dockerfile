# Frontend Dockerfile
FROM node:20-alpine

# Sett arbeidsmappe i containeren
WORKDIR /app

# Kopier package.json og package-lock.json først (for cache-optimalisering)
COPY package*.json ./

# Installer avhengigheter
RUN npm install

# Kopier resten av frontend-koden
COPY . .

# Bygg Next.js
RUN npm run build

# Eksponer port 3000
EXPOSE 3000

# Start Next.js i produksjonsmodus
CMD ["npm", "run", "start"]
