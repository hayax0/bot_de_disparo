# AGENTS.md — Abordai (bot_de_disparo)

Plataforma SaaS de prospecção comercial, campanhas de WhatsApp e CRM.

## Estrutura

- `backend/`: API Express + TypeScript, Prisma/PostgreSQL, BullMQ/Redis e integração WhatsApp com Baileys.
- `frontend/`: Next.js, React, Tailwind e Zustand.
- `docker-compose.production.yml`: serviços de produção para PostgreSQL, Redis, backend e frontend.

## Fluxo obrigatório de trabalho

1. Abrir uma Issue no GitHub com o problema ou objetivo e critérios de aceite.
2. Criar branch a partir de `main`: `fix/<descricao-curta>`, `feat/<descricao-curta>` ou `chore/<descricao-curta>`.
3. Implementar com mudanças limitadas ao escopo da Issue.
4. Abrir PR com `Closes #N`. Nunca enviar diretamente para `main`.
5. Publicar na VPS somente depois do merge. Seguir o procedimento e os cuidados de [DEPLOY.md](DEPLOY.md).

## Verificações antes do PR

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend && npx tsc --noEmit && npm run lint
```

## Convenções

- Commits Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.
- UI e mensagens para usuários em pt-BR; código e comentários técnicos podem usar pt-BR.
- Não inclua arquivos `.env`, credenciais, tokens ou dados privados no Git.

## Regras de arquitetura

- Envios de WhatsApp passam pela fila BullMQ `message-queue`; nunca envie mensagens diretamente em uma requisição HTTP.
- Use o `jobId` determinístico `${campaignId}_${leadId}`; não use `Date.now()` como ID.
- Mantenha conexões Redis separadas para Queue, QueueEvents e Worker (`backend/src/services/queue.ts`).
- O ciclo de vida das sessões Baileys, o encerramento de sockets e os locks ficam em `WhatsappManager`; não crie um mecanismo paralelo de retry.
- Falhas transitórias de jobs só marcam o lead como `ERROR` na tentativa final.
- Leads `QUEUED` sem job são órfãos; o fluxo existente de recuperação deve continuar ativo.

## Observabilidade e ambiente

- Sentry é configurado por `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN`.
- Consulte `backend/.env.example` para desenvolvimento e `.env.production.example` para produção. Mantenha os valores reais somente em arquivos locais protegidos.
