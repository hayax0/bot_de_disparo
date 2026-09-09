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

### 3. Construir as imagens e iniciar os serviços de dados
```bash
docker compose -f docker-compose.production.yml build backend frontend
docker compose -f docker-compose.production.yml up -d postgres redis
```

### 4. Executar as migrações do banco de dados (Prisma)
```bash
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run migrate:deploy
docker compose -f docker-compose.production.yml up -d --no-build backend frontend
```

---

## 🔒 Persistência e Segurança
- **Sessão do WhatsApp (Baileys):** Mapeada em volume local (`./backend/.baileys_auth`). Preserve esta pasta ao atualizar ou fazer backup.
- **Banco de Dados & Redis:** Executam em rede interna privada (`internal_network`), não expondo portas diretamente para a internet pública.

---

## 🔄 Atualização de Versão (Rollout)
Para atualizar o sistema sem perder sessões ou dados:
```bash
cd /opt/saas-bot
git pull origin main
docker compose -f docker-compose.production.yml build backend frontend
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run migrate:deploy
docker compose -f docker-compose.production.yml up -d --no-build backend frontend
```

Execute cada etapa apenas se a anterior terminar com sucesso. A migration roda na imagem nova, antes de substituir a aplicação em execução. O Prisma CLI é uma dependência de produção para permitir esse comando.

Para a atualização de segurança de setembro de 2026, consulte [CORRECOES-1-A-11.md](CORRECOES-1-A-11.md), especialmente a configuração do webhook e do envio de códigos de confirmação.

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
