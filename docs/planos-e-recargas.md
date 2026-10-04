# Planos e recargas — integração comercial oficial

Catálogo oficial integrado em 02/10/2026, issue #25.

| ID interno | Nome | Mensalidade | Disparos/ciclo | Créditos IA/ciclo | WhatsApp | Oferta Cakto | Checkout Oficial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| START | Essencial | R$ 27,99 | 1.000 | 50 | 1 | 1165260 | `https://pay.cakto.com.br/3ejxmar_1165260` |
| PRO | Profissional | R$ 55,99 | 3.000 | 150 | 1 | 1165278 | `https://pay.cakto.com.br/9gwgit3_1165278` |
| SCALE | Premium | R$ 95,99 | 6.000 | 300 | 1 | 1165304 | `https://pay.cakto.com.br/33zk2g2_1165304` |

| ID interno | Nome | Créditos comprados | Pagamento único | Oferta Cakto | Checkout Oficial |
| --- | --- | --- | --- | --- | --- |
| PACKAGE_SMALL | 100 créditos | 100 | R$ 9,99 | 1165355 | `https://pay.cakto.com.br/zmvfpjf_1165355` |
| PACKAGE_MEDIUM | 300 créditos | 300 | R$ 24,99 | 1165367 | `https://pay.cakto.com.br/dqywaqn_1165367` |
| PACKAGE_LARGE | 700 créditos | 700 | R$ 49,99 | 1165374 | `https://pay.cakto.com.br/cbd2uec_1165374` |

`backend/src/config/plans.ts` é a fonte oficial do catálogo. O painel consulta GET /api/integrations/plans com autenticação e gera checkout via POST /api/integrations/checkout.

## Regras de Negócio Implementadas

1. **Planos Comerciais (`START`, `PRO`, `SCALE`)**:
   - Compra aprovada atualiza `planId`, `monthlyDispatchQuota`, define `subscriptionStatus: 'ACTIVE'` e validade do ciclo.
   - Concede a franquia de créditos mensais de IA do plano (`CreditWalletService.grantMonthlyCredits`).
   - Reseta os disparos utilizados no ciclo (`QuotaService.resetCycleDispatches`).
   - Renovação recorrente (`subscription_renewed`) estende a validade, reseta a franquia de disparos e concede novos créditos mensais.

2. **Pacotes de Recarga (`PACKAGE_SMALL`, `PACKAGE_MEDIUM`, `PACKAGE_LARGE`)**:
   - Concede créditos extras via `CreditWalletService.grantPurchasedCredits`.
   - Créditos de recarga **não expiram** e são debitados somente após o término dos créditos mensais.
   - Recargas não alteram a franquia mensal de disparos nem a expiração da assinatura.
   - Registra a transação com idempotência em `CreditPurchaseOrder`.

3. **Compatibilidade e Legado**:
   - `LEGACY_DAVI`: condições antigas mantidas (sem franquia de IA e sem restrições de disparo).
   - Administradores (`ADMIN`): acesso vitalício e IA ilimitada garantidos pelo papel de sistema.
   - Apify pessoal: buscas de empresas continuam cobradas pelo provedor na conta do usuário, sem consumir créditos de IA da plataforma.

