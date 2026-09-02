# AGENTS.md — bot_de_disparo (bot-prospeccao-web)

Sistema SaaS de prospecção/disparo de mensagens via WhatsApp (whatsapp-web.js), com painel web.

## Estrutura

```
backend/    → API Express + TypeScript + Prisma (PostgreSQL) + BullMQ (Redis) + whatsapp-web.js
frontend/   → Next.js + Tailwind + Zustand
docker-compose.production.yml → deploy na VPS (postgres, redis, backend, frontend)
```

## Fluxo de trabalho OBRIGATÓRIO (qualquer agente/modelo)

Toda tarefa — correção, melhoria ou nova função — **DEVE** seguir este padrão:

1. **Abrir uma Issue no GitHub** descrevendo a tarefa (bug → logs/passo a passo; feature → objetivo e critério de aceite).
2. **Criar uma branch** a partir de `main` no padrão:
   - `fix/<descricao-curta>` para correções
   - `feat/<descricao-curta>` para novas funções
   - `chore/<descricao-curta>` para manutenção/infra
3. **Implementar** seguindo as regras deste arquivo.
4. **Abrir um PR mencionando a Issue** na descrição (`Closes #N`). Nunca fazer push direto na `main`.
5. **Deploy** em produção (VPS) só acontece após merge do PR:
   ```bash
   git pull
   docker compose -f docker-compose.production.yml up -d --build
   ```

## Comandos de verificação (rodar antes de todo PR)

```bash
# Backend
cd backend && npx tsc --noEmit && npm test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint
```

## Convenções

- **Commits**: Conventional Commits (commitlint): `feat: ...`, `fix: ...`, `chore: ...`, `test: ...`, `docs: ...`
- **Idioma**: UI e mensagens de erro em pt-BR; código e comentários técnicos podem ser em pt-BR.
- Minimizar mudanças: não tocar em lógica fora do escopo da Issue.

## Arquitetura (regras que NÃO podem regredir)

- **Envios sempre passam pela fila BullMQ** (`message-queue`). Nunca enviar WhatsApp dentro de request HTTP.
- **jobId determinístico**: `${campaignId}_${leadId}` — nunca usar `Date.now()` em jobId (quebra idempotência).
- Conexões Redis **separadas** para Queue / QueueEvents / Worker (ver `backend/src/services/queue.ts`).
- Sessão WhatsApp: sempre `destroy()` o client ao descartar (evita vazamento de Chromium); locks `Singleton*` devem ser removidos antes de re-inicializar.
- Reconexão automática com backoff vive em `WhatsappManager` — não criar retry paralelo.
- Erros transitórios em jobs **não** marcam lead como `ERROR`; só a tentativa final (ver `CampaignRunner`).
- Leads `QUEUED` sem job na fila = órfãos; `recoverOrphanedLeads()` roda no boot.

## Observabilidade

- **Sentry** configurado no backend e frontend (DSN via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`).

## Ambiente

- Variáveis documentadas em `backend/.env.example` e `.env.production.example` — nunca commitar `.env` real.
