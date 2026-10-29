# Jornada guiada e revisão de campanhas — etapas 1 e 2

## Experiência

- Guia recolhível por usuário neste navegador: conexão real, público adicionado à campanha, revisão e primeiro envio registrado. Não conecta, busca nem envia automaticamente. Contas existentes podem usar o guia sem mudança de plano, conta ou saldo.
- “Buscar Empresas” mostra até três sugestões gratuitas por regras do perfil profissional concluído. Usa o público informado; criação de sites sugere “Sem site próprio”; outras ofertas mantêm “Todas”. Nunca inventa cidade nem sobrescreve os campos até “Aplicar à busca”. Não é uma chamada de IA nem uma previsão de conversão.
- A busca explica o consumo na conta Apify do próprio usuário, inclusive descartados, sem créditos da plataforma. A geração consulta `/campaigns/:id/ai-estimate`, exibe reserva máxima, saldo, limite de 200 mensagens e liberação da parte não aplicada. A confirmação leva `maxCredits`: se novos contatos aumentarem o lote além do teto exibido, a API recusa antes da reserva e pede nova confirmação. Regenerar consome novamente; revisar/editar manualmente é grátis.
- Iniciar, continuar e tentar falhas abrem a revisão; não iniciam diretamente. A revisão funciona desconectado, mas a confirmação de envio exige conexão.
- Lista paginada em 10 contatos, seleção explícita e texto final por destinatário. Edição manual de pendentes usa a rota existente e exige nova revisão. Confirmar exige marcar a declaração de revisão; o fechamento nunca envia.
- Até 500 contatos por lote de revisão. Os demais continuam pendentes. Ao terminar a seleção enviada, a campanha pausa se houver outros pendentes. Falhas anteriores só entram na revisão de repetição, excluindo transmissão iniciada/ambígua.

## Garantias e limites

`POST /campaigns/:id/send-review` é gratuito e não modifica leads. Renderiza variáveis e Spintax com semente determinística, retornando comprovante HMAC com workspace, campanha, modo, digest de contatos/textos/versões e validade de 15 minutos. Não inclui texto no token nem cria uma nova credencial de autenticação.

`POST /:id/start` e `/:id/retry-failed` exigem `{token, leadIds}`. Uma transação bloqueia campanha e destinatários, revalida revisão/elegibilidade, congela `messageContent`, marca somente os selecionados e associa um UUID de lote. Alteração por edição/IA depois da revisão produz conflito 409. Os outros contatos não são enviados. Não há reserva de créditos de IA nesta operação.

Migração aditiva `20261029170000_campaign_send_review`: `Campaign.activeSendBatchId` e `Lead.sendBatchId`, ambos nulos inicialmente. O UUID também acompanha o payload BullMQ; o jobId permanece `${campaignId}_${leadId}`. O worker confere lote no carregamento e na barreira atômica anterior à transmissão. Jobs antigos não podem enviar a nova seleção. Campanhas legadas ainda sem lote podem concluir jobs já existentes; um novo início pela API sempre requer revisão.

A fila é preparada fora da transação, protegida por STARTING; falha devolve apenas o lote selecionado a PENDING preservando os textos. PAUSING impede novo início durante a drenagem da fila; boot recupera preparação/pausa interrompida. As regras financeiras, transmissão ambígua, opt-out, franquias e assinatura seguem revalidadas pelo worker.

Uma revisão desatualizada não é atualizada silenciosamente: o usuário precisa clicar “Atualizar revisão” e confirmar novamente. Ao atualizar, variações de template ainda não gravadas podem mudar; a versão exibida na confirmação será congelada para envio. Bloqueios/opt-out e expiração do plano posteriores podem impedir envios já aprovados.

## Validação local

Executar os comandos de AGENTS.md. Testes PostgreSQL reais em `CampaignSendReview.postgres.test.ts`: seleção, texto exato, assinatura/escopo, mudança de conteúdo, mensagem vazia, concorrência de início, transmissão ambígua, falha de fila e rotas/estimativa. Testes do worker cobrem lotes antigos, mensagem congelada e pausa ao terminar seleção. Nenhum teste inicia provedor pago ou envia WhatsApp real.

Revisão visual local com conta exclusiva de demonstração, desktop e celular: guia, sugestão aplicada sem busca, seleção e edição com manutenção de selecionados e estimativa real de IA. Nenhuma alteração na VPS nesta etapa. Antes de publicar, aplicar a migração após backup e atualizar backend/frontend juntos; clientes antigos recebem pedido de revisão ao tentar iniciar sem comprovante.
