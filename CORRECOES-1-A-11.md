# Correções da revisão de segurança e confiabilidade

As alterações são locais, na branch `fix/security-campaign-reliability`. A publicação no GitHub e o deploy ficam a cargo do responsável pela plataforma. Antes de publicar, abrir a Issue e o PR conforme AGENTS.md; não enviar diretamente à main.

## Alterações

1. Webhook exige o segredo exato configurado. Ausência, diferença de caixa e antigos segredos fixos não são exceções. Sem configuração, o endpoint fica indisponível.
2. Ativação de contas pré-criadas exige código enviado por e-mail, com validade de 10 minutos, cooldown de 1 minuto, cinco tentativas e consumo único na mesma transação da definição da senha.
3. Novos cadastros administrativos exigem a mesma confirmação. Login, `/me`, consulta de pagamento e middleware não promovem usuários apenas por e-mail. Administradores e contas LIFETIME já persistidos são preservados.
4. Respostas do webhook contêm apenas `success` e `message`. Logs não imprimem payload ou segredos; novos registros de auditoria guardam apenas evento e identificadores. Registros antigos não são apagados automaticamente.
5. Migration aditiva cria as colunas dos termos, a tabela de códigos, uma chave única para eventos e o marcador de início de envio.
6. Campanhas são validadas antes de mudar de estado. `STARTING` bloqueia envios durante a preparação; falha parcial pausa a campanha e permite nova tentativa. O worker adia jobs durante a preparação. Reinícios recuperam preparações interrompidas.
7. Antes de chamar o socket, o sistema grava `sendStartedAt`, o ID da mensagem e o conteúdo. Em caso de resultado incerto, marca erro para conferência e não reenvia automaticamente. A recuperação nunca devolve um envio incerto para PENDING. ACKs tardios podem confirmar esses envios.
8. Alteração da assinatura e registro do evento são uma transação. Eventos do mesmo cliente são serializados com lock PostgreSQL; chave única protege a idempotência. Erros de banco retornam 500 para permitir repetição. E-mails só saem após commit. Eventos sem identificador de evento/transação são rejeitados, não deduplicados pelo ID permanente da assinatura.
9. Erro de consulta do número é transitório. Só consulta concluída sem encontrar conta retorna número inexistente.
10. ACKs usam compare-and-set no banco e releem o estado em caso de concorrência. O commit do worker não rebaixa READ/DELIVERED/REPLIED para SENT.
11. Busca no histórico não altera a identidade da função que carrega os dados iniciais. Respostas antigas são ignoradas quando uma consulta mais recente foi iniciada.

## Antes de atualizar a VPS

- Faça backup do PostgreSQL e preserve os volumes de dados e `.baileys_auth`.
- Defina `CAKTO_WEBHOOK_SECRET` no `.env` da VPS e configure exatamente o mesmo segredo no painel Cakto. Use um valor novo: os antigos valores fixos estavam expostos no código/logs. O Compose recusa iniciar sem essa variável.
- Confirme `RESEND_API_KEY`, `RESEND_FROM_EMAIL` com domínio autorizado e `RESEND_REPLY_TO`. Contas existentes com senha continuam fazendo login normalmente; ativação de contas de pagamento e novos administradores dependem da entrega do código.
- Revise os administradores existentes: a correção preserva seus acessos e não permite concluir, só pelo código, se alguma conta foi criada indevidamente antes da atualização.
- Logs e WebhookLog antigos podem conter segredos/dados. Trate sua retenção conforme a operação; esta migration não exclui auditoria. Eventos antigos já registrados continuam considerados processados: eventuais pagamentos perdidos antes da correção precisam de conciliação com a Cakto.
- Pause campanhas e aguarde envios em andamento antes de substituir o backend. Leads antigos que ficaram em SENDING sem confirmação são sinalizados para conferência, não reenviados.

Após revisão e merge do PR, execute na VPS, uma etapa por vez:

```bash
git pull origin main
docker compose -f docker-compose.production.yml build backend frontend
docker compose -f docker-compose.production.yml run --rm --no-deps backend npm run migrate:deploy
docker compose -f docker-compose.production.yml up -d --no-build backend frontend
```

Se build ou migration falhar, pare antes de atualizar os containers. O procedimento pressupõe PostgreSQL/Redis já em execução, como na VPS atual. A migration é compatível com o código anterior, mas reverter o backend também reintroduz as falhas de segurança.

## Conferência após deploy

Verificar healthcheck, login existente, código de ativação recebido, evento válido repetido sem duplicação, webhook inválido rejeitado e uma campanha pequena com contatos autorizados. Conferir no painel que falhas de preparação permitem tentar novamente e que envios incertos aparecem com orientação de conferência.

## Validação local concluída

- Backend: build (Prisma generate + TypeScript) e 95 testes aprovados.
- Frontend: TypeScript, ESLint sem avisos e build de produção aprovados.
- O build local do frontend utilizou o fallback WASM devido ao binário SWC incompatível no Windows e exibiu aviso de múltiplos lockfiles. Terminou com sucesso.
- Docker/PostgreSQL local não estavam disponíveis para executar a migration num banco descartável; a migration foi revisada junto ao schema. Não foi aplicado SQL na VPS.

Os testes automatizados usam rotas e funções de produção com dependências externas substituídas. Eles não equivalem a uma validação de pagamento, envio de e-mail ou WhatsApp reais. Não foi feito deploy nem acesso ao banco da VPS.
