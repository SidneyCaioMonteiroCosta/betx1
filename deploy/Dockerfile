# Dockerfile usado SOMENTE pelo Fly.io (referenciado em fly.toml).
# Fica nesta subpasta de propósito: se ficasse na raiz, a Railway trocaria
# o builder dela (Nixpacks) por Docker e quebraria o deploy.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
