# Deploy de produção

Este guia descreve o procedimento Docker do Abordai na VPS. O endereço público configurado é `https://abordai.cmpx.tec.br`; frontend e API usam a mesma origem, e a API fica em `/api`. O estado atual de uma VPS deve ser conferido antes de qualquer alteração.

## Pré-requisitos

- Docker Engine e Docker Compose instalados no servidor.
- Repositório clonado no diretório de instalação, por exemplo `/opt/saas-bot`.
- DNS e HTTPS configurados no Nginx conforme `infra/nginx/abordai.conf`.
- Arquivo `.env` de produção preenchido com valores secretos e específicos do ambiente.

## Primeira instalação

```bash
git clone https://github.com/hayax0/bot_de_disparo.git /opt/saas-bot
cd /opt/saas-bot
cp .env.production.example .env
```

Edite `.env` no servidor. Gere `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` e `CRON_SECRET` com valores aleatórios fortes. Configure `CAKTO_WEBHOOK_SECRET` com o mesmo segredo do webhook configurado no painel Cakto. Guarde `INTEGRATION_ENCRYPTION_KEY` em segurança: ela protege as credenciais pessoais de integração armazenadas no banco; perdê-la pode impedir a leitura dessas credenciais.

Mantenha `CORS_ORIGIN`, `PLATFORM_URL` e `NEXT_PUBLIC_APP_URL` no domínio canônico e `NEXT_PUBLIC_API_URL=/api`, como no arquivo de exemplo. `APIFY_API_TOKEN` é uma variável de compatibilidade para execuções históricas; novas buscas usam a credencial Apify pessoal conectada pelo usuário. `GEMINI_API_KEY`, Resend, Turnstile e Sentry são configurados conforme os recursos que o ambiente usa. Não copie segredos para issues, PRs ou logs.

Construa os serviços, suba banco e Redis, aplique as migrações e só então inicie a aplicação:

```bash
docker compose -f docker-compose.production.yml build backend frontend
docker compose -f docker-compose.production.yml up -d postgres redis
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run migrate:deploy
docker compose -f docker-compose.production.yml up -d --no-build backend frontend
docker compose -f docker-compose.production.yml ps
```

Confira os logs dos serviços e o endpoint de saúde `https://abordai.cmpx.tec.br/api/health` após a inicialização.

## Atualização

Faça deploy apenas depois do merge do PR em `main`, conforme `AGENTS.md`. Antes de atualizar, confira se o diretório de produção está na branch esperada e sem alterações locais. Gere e valide um backup do PostgreSQL com `bash scripts/backup-db.sh` e preserve arquivos de ambiente, uploads e sessão do WhatsApp.

```bash
cd /opt/saas-bot
bash scripts/backup-db.sh
git status --short --branch
git pull --ff-only origin main
docker compose -f docker-compose.production.yml build backend frontend
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run migrate:deploy
docker compose -f docker-compose.production.yml up -d --no-build backend frontend
docker compose -f docker-compose.production.yml ps
```

Se uma etapa falhar, pare e investigue antes de continuar. Não use `docker compose down -v`: isso pode remover volumes de dados.

## Persistência e rede

O Compose mantém volumes para PostgreSQL e Redis e monta `backend/.baileys_auth` e `backend/uploads`. Faça backup desses dados conforme a política operacional do servidor. PostgreSQL e Redis não publicam portas no host; os serviços conversam pela rede bridge do Compose. A configuração Nginx e o firewall do host são gerenciados fora do Compose.

## Integrações externas

- Configure o webhook Cakto para a rota `/api/webhooks/cakto` e use o segredo correspondente em `.env`.
- Cada usuário conecta sua própria conta Apify na plataforma; a busca é executada pelo Actor configurado no backend e pode gerar cobrança na conta Apify.
- O mapa de busca usa Leaflet com tiles OpenStreetMap. A chave da API Google Maps não é necessária para esse mapa.
- Configure domínio, remetente e chaves de e-mail no Resend antes de depender de envio transacional.
