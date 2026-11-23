# Progresso da geração de IA

A geração de mensagens é executada como operação em segundo plano. O modal mostra o progresso e permite acompanhar depois; fechar a janela não cancela a operação. Ao retornar à campanha, o painel pode consultar a operação e exibir o resultado final.

O painel consulta o estado da operação em sequência, aproximadamente a cada dois segundos enquanto acompanha o progresso. Falhas temporárias de consulta mantêm o último estado conhecido e permitem nova tentativa sem iniciar uma nova geração.

Os estados finais incluem conclusão, conclusão parcial e falha. O resumo informa mensagens geradas e não geradas; percentual de processamento encerrado não significa que todos os textos foram gerados com sucesso.

Os contadores são derivados dos registros da operação persistidos pelo backend. O saldo e o resultado final são atualizados após a liquidação da operação. Se o painel não conseguir consultar o estado, use a ação de tentar novamente antes de iniciar outra geração.

Esse documento descreve o comportamento atual do componente `frontend/src/components/dashboard/AiCampaignAssistant.tsx` e dos endpoints de operação em `backend/src/services/AiCopyService.ts`.
