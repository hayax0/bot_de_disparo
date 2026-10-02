# Planos e recargas — preparação comercial

Catálogo aprovado em 02/10/2026, issue #25. Novas compras estão desativadas nesta etapa.

| ID interno | Nome | Mensalidade | Disparos/ciclo | Créditos IA/ciclo | WhatsApp |
| --- | --- | --- | --- | --- | --- |
| START | Essencial | R$ 27,99 | 1.000 | 50 | 1 |
| PRO | Profissional | R$ 55,99 | 3.000 | 150 | 1 |
| SCALE | Premium | R$ 95,99 | 6.000 | 300 | 1 |

| ID interno | Créditos comprados | Pagamento único |
| --- | --- | --- |
| PACKAGE_SMALL | 100 | R$ 9,99 |
| PACKAGE_MEDIUM | 300 | R$ 24,99 |
| PACKAGE_LARGE | 700 | R$ 49,99 |

`backend/src/config/plans.ts` é a fonte do catálogo. O painel consulta GET /api/integrations/plans com autenticação; não duplica preços no frontend.

## Regras preservadas

- IA: 1 crédito por mensagem gerada/regenerada com sucesso; edição manual gratuita.
- Créditos mensais expiram, não acumulam e são utilizados antes dos comprados.
- Créditos comprados não expiram; o uso exige assinatura ativa.
- Recargas não alteram franquia de disparos nem pagam consumo da Apify.
- Apify pessoal, com cobrança pelo provedor na conta do usuário.
- Administradores por papel ADMIN: IA ilimitada, sem necessidade de recargas.
- LEGACY_DAVI/LEGACY: condições antigas e interface de carteira/recargas oculta.
- Nenhum saldo, plano ou ciclo existente é migrado automaticamente. Cotas específicas já gravadas no usuário são preservadas; o painel mostra a cota efetiva do ciclo, que pode diferir do catálogo novo.

## Bloqueio de compra

`purchaseEnabled: false` e botões desativados. POST /api/integrations/checkout devolve 503 CHECKOUT_UNAVAILABLE sem movimentar carteira, alterar assinatura ou criar checkout. Não reutiliza CAKTO_CHECKOUT_URL do produto antigo. Webhook e produto legados permanecem inalterados.

## Próxima etapa, antes de vender

1. Obter IDs de produtos/ofertas e links dos seis checkouts Cakto.
2. Mapear explicitamente cada produto ao plano ou pacote no servidor; não aceitar valores/créditos informados pelo navegador.
3. Implementar confirmação autenticada e idempotente de pagamento, renovação de franquias/créditos, cancelamento, reembolso e contestação; preservar o fluxo legado.
4. Validar taxas e custo real do Gemini antes de habilitar preços de recargas.
5. Atualizar landing page, cadastro e fluxo de contratação (ainda legados) para os novos planos.
6. Testar compra/renovação/repetição de webhook em ambiente controlado. Só então habilitar checkout, via PR e deploy.

Esta etapa entrega catálogo, exibição e franquias padrão. Não ativa pagamentos, não concede franquias mensais automaticamente e não altera os termos de clientes existentes.
