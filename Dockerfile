# Imagem Node oficial (Debian slim — compatível com qualquer dependência)
FROM node:20-slim

WORKDIR /app

# Instala dependências primeiro (cache de build)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o resto do código
COPY . .

ENV NODE_ENV=production
# A porta é definida pelo Fly via fly.toml (internal_port)
EXPOSE 3000

CMD ["node", "server.js"]
