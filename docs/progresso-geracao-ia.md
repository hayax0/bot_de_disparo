# Progresso da geração de IA

O modal mantém a operação visível até que o usuário clique em Ver mensagens ou feche a janela. Ao receber COMPLETED, PARTIAL ou FAILED, exibe o resumo final em vez de retornar ao formulário de geração. A barra mede processamento encerrado (100% nos estados terminais), enquanto o resumo separa mensagens geradas e não geradas. Uma falha/parcial aparece em âmbar, sem confirmação falsa de sucesso.

As consultas são sequenciais a cada dois segundos após a resposta anterior. Apenas campanha/ID da operação controlam o ciclo; callbacks atuais do painel ficam em ref para evitar reiniciar o polling a cada renderização. A conclusão atualiza mensagens/saldo uma única vez por montagem da operação. Falhas temporárias de consulta mantêm o último progresso e um aviso, com nova tentativa automática.

Antes de habilitar a geração, verifica uma operação existente; se a consulta inicial falhar, exige tentar novamente para evitar iniciar sem saber o estado atual. O status do backend também expõe processedLeads/generatedLeads, calculados a partir dos itens persistidos: a preparação avança antes de completedLeads ser confirmado na liquidação atômica. A barra só chega a 100% após o estado terminal. Nenhuma alteração em filas, cobrança ou idempotência.

Verificação local com transporte Axios simulado no componente real: painel renderizando cinco vezes por segundo, retomada de operação ativa, progresso 0→50→100, falha temporária de rede, resultado parcial/falha e confirmação persistente com navegação explícita. A página temporária de revisão não integra a versão publicada.
