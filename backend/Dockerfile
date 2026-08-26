FROM node:20-bullseye-slim

# Instalar dependências necessárias para o Chromium / Puppeteer do whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    ca-certificates \
    procps \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Definir variável para o Puppeteer usar o Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências completas (incluindo @types) para o build
RUN npm ci --include=dev

# Copiar código-fonte
COPY tsconfig.json ./
COPY src ./src

# Gerar Prisma Client e Compilar TypeScript para dist/
RUN npm run build

# Remover devDependencies para manter a imagem de produção leve
RUN npm prune --production

# Criar pasta para persistência da autenticação do WhatsApp
RUN mkdir -p /app/.wwebjs_auth /app/uploads && chmod -R 777 /app/.wwebjs_auth /app/uploads

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
