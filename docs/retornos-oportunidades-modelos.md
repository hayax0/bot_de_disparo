# Retornos, oportunidades e modelos pessoais

Entrega local da Issue #68, sobre o acompanhamento comercial do PR #67. Sem merge/deploy. Para publicar depois, incorporar primeiro as dependências dos PRs #65 e #67.

## Uso

- **Oportunidades e retornos** no menu: um contato por telefone normalizado no workspace, mesmo quando aparece em várias campanhas. O representante é o lead mais recente; Campanha abre essa lista.
- **Acompanhar contato**: editar etapa, reunião, anotações e próximo contato. Data civil no calendário local, atalhos Hoje/Amanhã. Salvar confirma; concluir remove a data sem alterar status do WhatsApp.
- **Retomar hoje**, **Atrasados**, **Próximos dias**, **Sem lembrete**: filtros. Contagens superiores incluem o workspace inteiro; o quadro mostra só a página atual (30 contatos), com paginação e busca no servidor.
- Colunas manuais: Não classificado, Não respondeu, Em conversa, Interessado, Reunião marcada e Não tem interesse. Reunião marcada usa o sinalizador existente e tem prioridade visual, preservando a etapa original. Leitura/entrega não inferem interesse.
- **Meus modelos**: até 200 por workspace, serviço/categoria e busca. Na criação de campanha e no editor de mensagem pendente, o seletor mostra prévia e só preenche o rascunho após clicar em Usar modelo. Edição/reutilização gratuitas, sem alterar campanhas antigas.
- **Preparar mensagem de retorno com IA**: instrução e confirmação explícitas; até 1 crédito por sugestão concluída (administradores seguem isenção). Texto separado do histórico enviado, editável/copiar, sem modificar Lead ou enviar WhatsApp. Exige assinatura/plano/saldo válidos. Falhas não debitam; repetir a mesma solicitação recupera o resultado. Nova sugestão após sucesso ou falha terminal exige nova confirmação.

Os lembretes ficam dentro do painel: sem e-mail, integração de calendário ou envio automático. O usuário revisa e usa o texto na conversa desejada; copiar não envia.

## Proteções e dados

- Migração aditiva `20261030140000_followups_templates`: `CommercialContact.nextContactAt DATE` e tabela `MessageTemplate` com cascade do workspace. Aplicada só nos bancos locais de desenvolvimento e testes.
- GET `/api/campaigns/commercial-contacts`: filtros search, stage, meeting, reminder, today (AAAA-MM-DD), page, limit. Deduplica antes de filtrar/paginar, sem inferir nono dígito; snapshot RepeatableRead.
- PUT comercial aceita nextContactAt opcional; cliente antigo que omite preserva a data. Versão obrigatória; 409 mantém rascunho.
- CRUD `/api/templates`: title80, service80, content2000; update/delete com versão. Workspace derivado da autenticação, sem exceção administrativa entre contas.
- POST `/api/campaigns/:id/leads/:leadId/ai-regenerate` com purpose FOLLOW_UP usa serviço separado. Reserva e operação na mesma transação; lock por solicitação; liquidação e resultado atômicos. Fluxo financeiro da regeneração anterior preservado.
- Sugestões interrompidas: reservas liberadas após dois minutos, verificadas no boot e a cada minuto, sem repetir chamada paga. Inclui cascade da campanha removida. Não há transação aberta durante chamada externa.
- Bloqueios/descadastros impedem geração. Anonimização remove lembretes e resultados/orientações dessas sugestões; lock compartilhado impede gravação tardia. Templates são textos pessoais reutilizáveis, sem vínculo com um lead específico.
- Filas, jobIds, cotas e condições comerciais existentes preservados.

## Validação

Backend: TypeScript e **316 testes passaram**, zero falhas/skip. PostgreSQL real cobre isolamento, calendário, deduplicação/paginação, versões concorrentes, limite de modelos, preservação de carteira/envios, sugestão idempotente, falha de provedor, interrupção, exclusão de campanha durante geração e anonimização concorrente. IA simulada, sem chamadas pagas.

Frontend: TypeScript e ESLint limpos. Navegador local: salvar retorno para hoje e filtrar; rascunho protegido no Escape; criar modelo; conflito409 preservando texto; recarregar versão explicitamente; aplicar modelo só ao rascunho da campanha. Responsividade em390px, sem mensagem real enviada. Gemini real não validado nesta entrega local.
