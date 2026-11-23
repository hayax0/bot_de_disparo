# Acompanhamento comercial e resultados

## Acompanhar contatos

Em **Minhas Campanhas → Ver Leads**, a ação de acompanhamento abre uma ficha comercial separada dos estados técnicos de envio. O usuário pode registrar etapa, notas, reunião marcada e data do próximo contato.

As etapas manuais incluem Não classificado, Não respondeu, Em conversa, Interessado e Não tem interesse. Reunião marcada é um sinalizador comercial. «Não tem interesse» não substitui a blacklist ou um pedido de descadastro.

Os dados são compartilhados pelo telefone normalizado dentro do workspace. Um contato reencontrado em outra campanha conserva o acompanhamento; outro workspace permanece independente. A ficha não altera mensagens, jobs ou status técnico do WhatsApp.

## Resultados comerciais

Abra **Resultados comerciais** pelo menu lateral. A página permite atualização manual e recarrega a cada 30 segundos quando está visível; alterações salvas no CRM também disparam atualização.

O resumo inclui contatos e resultados comerciais persistidos. A comparação por campanha mostra atividade e resposta observadas. Resposta é baseada no status técnico `REPLIED`; leituras e entregas não são consideradas respostas nem sinal de interesse.

Vendas entram no gráfico quando o usuário registra manualmente valor e data em um contato. Os filtros incluem 7 dias, 30 dias, mês atual, ano e período personalizado. A série pode agrupar por dia, semana ou mês, com faturamento, número de vendas, ticket médio e comparação ao período anterior. O gráfico representa os registros do workspace, não uma atribuição automática de vendas a campanhas.

Os indicadores contam dados persistidos e podem usar regras de deduplicação específicas. A lista e seus totais não devem ser somados entre campanhas como se fossem eventos financeiros independentes.

## Notas técnicas

- A API valida a sessão e deriva o workspace do usuário autenticado.
- A ficha usa controle de versão; conflito de edição informa que os dados precisam ser atualizados.
- O acompanhamento não envia convite de calendário, e-mail ou mensagem de WhatsApp.
- Para ver as demais ferramentas do CRM, use os itens correspondentes do menu lateral; a navegação principal não é duplicada dentro da página.
