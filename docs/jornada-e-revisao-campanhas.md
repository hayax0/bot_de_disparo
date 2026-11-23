# Jornada de campanha e revisão antes do envio

## Fluxo

1. Conecte o WhatsApp e prepare uma campanha.
2. Selecione ou adicione contatos e gere as mensagens com IA, quando desejado.
3. Revise os contatos selecionados e o texto final de cada destinatário.
4. Confirme o envio explicitamente; a API valida a revisão e cria os jobs na fila.

«Buscar Empresas» pode sugerir parâmetros a partir do perfil profissional. A sugestão não inicia busca; o usuário escolhe cidade e filtros e confirma. A busca usa a conta pessoal Apify e pode ser cobrada pela Apify, sem consumir créditos de IA da plataforma.

A estimativa de IA apresenta o limite e o saldo antes da geração. Se a seleção mudar e ultrapassar o limite confirmado, a API pede uma nova confirmação. Editar texto manualmente não consome crédito; gerar novamente pode consumir.

A geração pode continuar em segundo plano se o modal for fechado ou se o usuário escolher acompanhá-la depois. O progresso e o resultado ficam associados à operação/campanha.

## Revisão de envio

A revisão apresenta os textos finais e permite seleção explícita de destinatários. Cada lote de revisão aceita até 500 contatos. Iniciar, continuar ou repetir falhas conduz à revisão; não começa a transmitir automaticamente.

A confirmação só enfileira os contatos selecionados. O token de revisão tem validade de 15 minutos e deixa de ser válido se o texto ou a elegibilidade dos destinatários mudar. Uma revisão desatualizada precisa ser atualizada e confirmada novamente.

Os envios são processados pelo BullMQ. Falhas transitórias podem ser repetidas pela fila; só a falha final marca o lead como erro. A fila e o worker verificam o lote antes da transmissão. Pausar uma campanha impede novos inícios e aguarda o tratamento dos jobs existentes conforme o fluxo implementado.

## Limites

- A revisão é um passo de confirmação; ela não valida consentimento legal nem garante entrega.
- Uma resposta externa que não for capturada pela integração não aparece como resposta registrada.
- Créditos, assinatura, franquia e opt-out continuam sendo validados pela API e pelo worker.
- Os detalhes de implementação devem ser conferidos em `backend/src/services/CampaignSendReview.ts`, `backend/src/services/CampaignStarter.ts` e `backend/src/services/CampaignRunner.ts`.
