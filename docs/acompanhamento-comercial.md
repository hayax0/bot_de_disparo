# Etapa 3 — acompanhamento comercial

## Uso

Em **Minhas Campanhas → Ver Leads**, a coluna **Comercial / Anotações → Acompanhar** abre uma ficha independente do envio. É possível registrar:

- Não classificado, Não respondeu, Em conversa, Interessado ou Não tem interesse.
- Anotações em texto simples, até 4.000 caracteres.
- Reunião marcada, apenas após combinação com o contato. O campo não envia convite nem agenda um evento.

Os dados são compartilhados pelo telefone normalizado dentro do workspace. Um contato reencontrado em outra campanha conserva a classificação e as notas; outro workspace com o mesmo telefone tem acompanhamento independente. Números brasileiros com/sem DDI e formatação são equivalentes, sem inserir o nono dígito. Contatos anonimizados não podem receber acompanhamento.

A ficha não consome créditos e não altera plano, franquia, mensagem, estado técnico ou jobs. “Não tem interesse” é classificação comercial e não substitui a blacklist/opt-out. Salvar manualmente interesse ou reunião também não cria uma resposta técnica de WhatsApp.

Os filtros comerciais e de reunião combinam com busca, paginação e status técnico no servidor. Contadores de envio do monitoramento continuam representando toda a campanha, conforme aviso junto aos filtros.

## Resultados comerciais

Nova aba disponível na navegação do painel, com atualização manual e a cada 30 segundos enquanto visível:

- Resumo de contatos únicos, respondidos no WhatsApp, interessados atuais e reuniões registradas.
- Comparação por campanha: contatos, envios confirmados, respondidos, taxa de resposta, em conversa, interessados e reuniões.
- Busca por nome, ordenação e paginação da comparação; atalho para acompanhar cada campanha.

O resumo deduplica o telefone também entre campanhas. A tabela deduplica dentro de cada campanha; portanto, linhas não são aditivas. Interesse/reunião correspondem à classificação atual compartilhada dos contatos presentes na lista e **não atribuem uma venda à campanha**.

“Respondidos” utiliza somente o status técnico REPLIED registrado pela integração. Envios confirmados consideram sentAt preenchido ou status SENT/DELIVERED/READ/REPLIED. Taxa = respondidos ÷ confirmados, com uma casa decimal; sem envios, exibe travessão. Leituras/entregas não viram interesse automaticamente. Respostas externas/não capturadas e reuniões não registradas não entram. Os indicadores refletem o estado atual persistido, não um histórico de eventos ou faturamento.

## Persistência e segurança das alterações

Migração aditiva `20261029173000_commercial_contacts` cria `CommercialContact` com chave única `(workspaceId, phone)` e versão de edição. As rotas derivam workspace da autenticação e validam a propriedade de campanha **e** lead, sem exceção administrativa entre contas:

- GET/PUT `/campaigns/:id/leads/:leadId/commercial`.
- GET `/campaigns/commercial-metrics`.
- Filtros `commercialStage` e `meeting` em GET `/campaigns/:id/leads`.

PUT exige versão atual e payload estrito. Transações serializam alterações pelo contato; versões antigas retornam 409, preservando o rascunho na tela. Carregar a versão atual ou descartar o rascunho exige ação explícita. Escape passa pela proteção de rascunho da ficha e não fecha o monitoramento pai.

Anonimização usa a mesma normalização e o mesmo lock do acompanhamento. Apaga notas e trata variantes de telefone em todos os leads/histórico daquele workspace, evitando recriação por uma variante sobrevivente. Duplicatas legadas formatadas recebem identificadores anônimos distintos para preservar unicidade. Dados de outros workspaces permanecem intactos.

Consultas de métricas rodam no PostgreSQL em snapshot RepeatableRead. Respostas antigas das consultas de monitoramento/pós-save não substituem resultados de filtros ou páginas mais recentes.

## Validação e publicação

Backend: TypeScript e 293 testes aprovados, incluindo PostgreSQL real de isolamento, payload, compartilhamento, versão concorrente, filtros/paginação, agregações e anonimização com variantes. Frontend: TypeScript/lint, validação local de cadastro comercial, preservação de rascunho/Escape, filtros, comparação e layout em celular/desktop. Não houve busca paga nem envio real.

Esta branch inclui a base das etapas 1/2 (`feat/jornada-revisao-campanhas`, PR #65). O PR da etapa 3 é empilhado sobre essa base para revisão separada. Manter local, sem merge/deploy; ao publicar posteriormente, aplicar as migrações após backup e atualizar frontend/backend em conjunto.
