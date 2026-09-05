FROM node:20-bullseye-slim

WORKDIR /app

# Instalar certificados CA para requisições HTTPS seguras
RUN apt-get update && apt-get install -y \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências completas (incluindo devDependencies) para o build
RUN npm ci --include=dev

# Copiar código-fonte
COPY tsconfig.json ./
COPY src ./src

# Gerar Prisma Client e Compilar TypeScript para dist/
RUN npm run build

# Remover devDependencies para manter a imagem de produção leve
RUN npm prune --production

# Criar pastas de persistência de autenticação do Baileys e uploads
RUN mkdir -p /app/.baileys_auth /app/uploads && chmod -R 777 /app/.baileys_auth /app/uploads

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]
