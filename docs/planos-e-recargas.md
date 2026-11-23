# Planos e recargas

> Referência revisada em 23/11/2026. Os valores abaixo são os valores configurados em `backend/src/config/plans.ts`; confira a oferta externa Cakto antes de divulgar preço ou disponibilidade.

## Planos configurados

| ID | Plano | Preço mensal | Disparos por ciclo | Créditos de IA por ciclo | Conexões WhatsApp |
| --- | --- | ---: | ---: | ---: | ---: |
| `START` | Essencial | R$ 27,99 | 1.000 | 50 | 1 |
| `PRO` | Profissional | R$ 55,99 | 3.000 | 150 | 1 |
| `SCALE` | Premium | R$ 95,99 | 6.000 | 300 | 1 |

## Recargas configuradas

| ID | Créditos | Valor único |
| --- | ---: | ---: |
| `PACKAGE_SMALL` | 100 | R$ 9,99 |
| `PACKAGE_MEDIUM` | 300 | R$ 24,99 |
| `PACKAGE_LARGE` | 700 | R$ 49,99 |

## Como o checkout funciona

A API autenticada de integrações retorna o catálogo e a URL Cakto configurada para o plano ou pacote escolhido. Isso apenas encaminha ao checkout externo; não confirma que a oferta esteja publicada/ativa nem que o pagamento foi concluído. A assinatura ou recarga é atualizada após o webhook Cakto validado e processado.

Antes de anunciar um preço, confira a configuração em `backend/src/config/plans.ts` e a oferta correspondente no painel Cakto. Os IDs internos e identificadores externos são mantidos para correlacionar os eventos de pagamento.

## Regras de saldo e cotas

- Créditos mensais de IA são concedidos no ciclo de assinatura e não acumulam para o ciclo seguinte.
- Créditos comprados em recargas não expiram e são consumidos depois do saldo mensal.
- As recargas não aumentam a franquia mensal de disparos.
- Elegibilidade, saldo e status da assinatura são validados pelo backend antes do uso.
- Usuários com papel `ADMIN` têm os benefícios ilimitados definidos pelo sistema enquanto mantiverem esse papel. Contas legadas e exceções de disparo têm regras específicas; isso não é acesso vitalício geral.
- Buscas novas de empresas são cobradas pela conta pessoal do usuário na Apify e não pela carteira de IA da plataforma.
