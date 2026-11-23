# Frontend do Abordai

Aplicação web Next.js/React para o painel e páginas públicas do Abordai. O frontend usa Tailwind, Zustand e Leaflet.

## Desenvolvimento local

Instale as dependências e inicie o backend conforme [../LEIA-ME-LOCAL.md](../LEIA-ME-LOCAL.md). Na pasta `frontend/`, execute:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. O frontend usa `/api` como base de API; `next.config.ts` encaminha as chamadas para `INTERNAL_API_URL` ou, por padrão, `http://backend:3001`. Para desenvolvimento fora do Docker, configure `INTERNAL_API_URL=http://localhost:3001`.

## Verificações

```bash
npx tsc --noEmit
npm run lint
```

## Produção

O frontend de produção é empacotado como imagem Docker standalone e publicado junto com o backend na VPS. Use o fluxo de PR e deploy descrito em [../AGENTS.md](../AGENTS.md) e [../DEPLOY.md](../DEPLOY.md); este projeto não usa o deploy padrão de um template Vercel.
