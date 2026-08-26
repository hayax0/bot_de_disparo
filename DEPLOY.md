# Guia Completo de Deploy em Produção — SaaS Bot

Este documento fornece as instruções para subir a aplicação em qualquer servidor Linux (Ubuntu/Debian/AWS/DigitalOcean/Hetzner) de forma automatizada com Docker.

---

## 📋 Pré-requisitos no Servidor
- **Docker** e **Docker Compose** instalados.
- Domínio apontado para o IP do seu servidor (ex: `app.seusite.com` e `api.seusite.com`).

---

## 🚀 Passo a Passo de Deploy

### 1. Clonar o repositório no servidor
```bash
git clone https://github.com/hayax0/bot_de_disparo.git /opt/saas-bot
cd /opt/saas-bot
```

### 2. Configurar o arquivo de variáveis de ambiente
```bash
cp .env.production.example .env
nano .env
```
Preencha as variáveis com senhas fortes:
- `POSTGRES_PASSWORD`: Senha do banco PostgreSQL
- `JWT_SECRET`: Chave secreta de autenticação (gerada com `openssl rand -base64 32`)
- `CORS_ORIGIN`: URL pública do frontend (ex: `https://app.seusite.com`)
- `NEXT_PUBLIC_API_URL`: URL pública da API (ex: `https://api.seusite.com/api`)

### 3. Subir a aplicação com Docker Compose
```bash
docker compose -f docker-compose.production.yml up -d --build
```

### 4. Executar as migrações do banco de dados (Prisma)
```bash
docker compose -f docker-compose.production.yml exec backend npm run migrate:deploy
```

---

## 🔒 Persistência e Segurança
- **Sessão do WhatsApp (`.wwebjs_auth`):** Mapeada em volume local (`./backend/.wwebjs_auth`), garantindo que o número permaneça conectado mesmo se os containers forem reiniciados ou atualizados.
- **Banco de Dados & Redis:** Executam em rede interna privada (`internal_network`), não expondo portas diretamente para a internet pública.

---

## 🔄 Atualização de Versão (Rollout)
Para atualizar o sistema sem perder sessões ou dados:
```bash
cd /opt/saas-bot
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml exec backend npm run migrate:deploy
```

---

## 🧪 Comandos Úteis

- **Ver logs em tempo real:**
  ```bash
  docker compose -f docker-compose.production.yml logs -f
  ```
- **Ver logs apenas do backend:**
  ```bash
  docker compose -f docker-compose.production.yml logs -f backend
  ```
- **Rodar testes automatizados:**
  ```bash
  cd backend && npm test
  ```
