# Plataforma Disparador de Mensagens — Guia Oficial & Contexto do Sistema

> Documento interno confidencial para a equipe técnica e agentes de IA do projeto.  
> Última atualização: **02 de outubro de 2026**.  
> Idioma: **Português do Brasil (pt-BR)**.  
> Repositório: `bot_de_disparo` (`hayax0/bot_de_disparo`).

---

## 1. Visão Geral do Produto

O **Disparador de Mensagens** é uma plataforma SaaS completa de prospecção comercial consultiva e disparo automatizado pelo WhatsApp, com execução 100% em nuvem e painel web responsivo (Next.js + Express).

O sistema resolve o gargalo operacional de empresas e profissionais de vendas através de 3 pilares integrados:
1. **Busca e Enriquecimento de Leads**: Encontra estabelecimentos e empresas no Google Maps por nicho e cidade diretamente no painel (usando a conta pessoal do usuário na Apify via API Key).
2. **Motor de IA Integrado**: Gera abordagens altamente persuasivas e personalizadas para cada contato/empresa, analisando nicho, presença de site e localização sem textos genéricos.
3. **Disparos com Cadência Humana**: Executa os envios em segundo plano nos servidores da nuvem com simulação de ritmo humano (delays aleatórios de 45 a 120s, Spintax e pausas de lote), dispensando abas abertas ou computador ligado.

---

## 2. Catálogo Comercial e Modelo de Cobrança

A plataforma opera no modelo híbrido de **Assinatura Mensal (SaaS)** combinada com **Recargas Avulsas de IA (Pay-As-You-Go)**. Os pagamentos são processados pela **Cakto** com aprovação instantânea via PIX ou Cartão de Crédito.

### 2.1. Planos Mensais de Assinatura

| Plano | Preço Mensal | Franquia de Disparos | Franquia Mensal de IA | Conexões WhatsApp | Destaque | Checkout Cakto |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Essencial** (`START`) | R$ 27,99/mês | 1.000 disparos/mês | 50 créditos/mês | 1 conexão | Para autônomos e pequenos negócios | [Link Cakto](https://pay.cakto.com.br/3ejxmar_1165260) |
| **Profissional** (`PRO`) | R$ 55,99/mês | 3.000 disparos/mês | 150 créditos/mês | 1 conexão | **Mais Popular / Recomendado** | [Link Cakto](https://pay.cakto.com.br/9gwgit3_1165278) |
| **Premium** (`SCALE`) | R$ 95,99/mês | 6.000 disparos/mês | 300 créditos/mês | 1 conexão | Alto volume de prospecção | [Link Cakto](https://pay.cakto.com.br/33zk2g2_1165304) |

#### Regras de Assinatura e Franquias:
- **Disparos de WhatsApp**: Contabilizados mensalmente por ciclo. Caso a franquia se esgote, o usuário aguarda a renovação do ciclo ou faz upgrade de plano.
- **Créditos Mensais de IA**: Renovados automaticamente a cada pagamento de ciclo. **Não acumulam** de um mês para o outro (são consumidos com prioridade antes dos créditos avulsos).
- **Contas Legadas (`LEGACY_DAVI`)**: Condições contratuais originais preservadas; não possuem carteira de créditos de IA nem novas franquias comerciais de disparos.
- **Administradores (`ADMIN`)**: Acesso vitalício incondicional, sem franquia de disparos e IA irrestrita sem consumo de saldo.

---

### 2.2. Pacotes de Recarga Avulsa de Créditos de IA

Disponíveis para compra no Dashboard (`/dashboard`) quando o usuário esgota seus créditos mensais:

| Pacote | Créditos | Valor | Custo / Cópia | Destaque | Checkout Cakto |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pequeno** (`PACKAGE_SMALL`) | 100 créditos | R$ 9,99 | ~R$ 0,10 | Testes e campanhas pontuais | [Link Cakto](https://pay.cakto.com.br/zmvfpjf_1165355) |
| **Médio** (`PACKAGE_MEDIUM`) | 300 créditos | R$ 24,99 | ~R$ 0,08 | **Mais Vendido / Melhor Equilíbrio** | [Link Cakto](https://pay.cakto.com.br/dqywaqn_1165367) |
| **Grande** (`PACKAGE_LARGE`) | 700 créditos | R$ 49,99 | ~R$ 0,07 | Máximo desconto por abordagem | [Link Cakto](https://pay.cakto.com.br/cbd2uec_1165374) |

#### Regras das Recargas:
- **Validade**: Créditos comprados em recarga avulsa **nunca expiram**.
- **Consumo**: Apenas entram em ação quando os créditos mensais inclusos no plano estiverem zerados.
- **Uso**: Exigem que a assinatura da plataforma esteja ativa.

---

## 3. Funcionamento Operacional e Regras de Negócio

### 3.1. Inteligência Artificial
- **Custo**: Cada abordagem gerada ou regenerada com sucesso consome **1 crédito de IA**.
- **Edição**: Alterações manuais feitas pelo usuário nos textos são **100% gratuitas** (zero créditos).
- **Privacidade de Fornecedor**: Nas interfaces públicas e de usuário, o motor é tratado como **Motor de IA Integrado / Agente de IA da Plataforma**, sem menção direta a nomes de modelos de terceiros.

### 3.2. Busca de Leads no Google Maps
- Realizada no painel informando nicho e localização (ex: "Academias em Curitiba").
- A execução conecta-se diretamente à **conta Apify pessoal do usuário** através da API Token configurada por ele.
- **Consumo de IA**: A busca em si **NÃO** consome créditos de IA da carteira da plataforma (o custo de extração é debitado dos créditos gratuitos/pagos da própria conta Apify do cliente).
- Os contatos extraídos vêm higienizados com telefone internacional (`+55`), nome e endereço.

### 3.3. Disparos e Proteção Anti-Bloqueio
- **Fila Assíncrona na Nuvem**: Processada via **BullMQ + Redis**. O usuário pode fechar o navegador ou desligar a máquina.
- **Cadência Humana**:
  - Delays aleatórios entre envios (ex: 45s a 120s).
  - Pausas automáticas de lote programadas pelo sistema.
  - Spintax dinâmico para variação contextual (`{Olá|Oi|Bom dia}`).
  - Variáveis dinâmicas: `{nome}`, `{website}`, `{bairro}`, `{meuNome}`, `{minhaEmpresa}`.
- **Histórico Permanente por Workspace**: Impede o retrabalho e o constrangimento de reenviar mensagens para o mesmo número em campanhas futuras.
- **Conexão WhatsApp Web**: Escaneamento via QR Code pelo aplicativo oficial do WhatsApp (Menu > Aparelhos Conectados). Possui rotina de auto-reconexão e watchdog no backend.

---

## 4. Arquitetura Técnica e Regras Invioláveis

Conforme estabelecido no [`AGENTS.md`](file:///Users/caiocampos021/Developer/bot_de_disparo/AGENTS.md):

1. **Envios Exclusivamente via Fila**: Nenhuma mensagem de WhatsApp pode ser disparada diretamente em requisição HTTP. Sempre enfileirar em `message-queue` (BullMQ).
2. **JobId Determinístico**: Sempre `${campaignId}_${leadId}` para garantir idempotência matemática contra envios duplicados.
3. **Sessão WhatsApp**: Sempre chamar `.destroy()` ao descartar instâncias de clientes para evitar acúmulo de processos Chromium zumbis em memória. Remover locks `Singleton*` antes de re-inicializar.
4. **Tratamento de Falhas Transitórias**: Jobs em retry transitório não marcam leads como `ERROR`; apenas a falha definitiva na tentativa final atualiza o status.
5. **Automação de Webhooks Cakto**: O endpoint `/api/webhooks/cakto` processa compras de planos, concessão de cotas de disparos e créditos extras com locks distribuídos por cliente (`cakto:lock:${email}`) para prevenir race conditions.
6. **Fluxo Git Obrigatório**: Mudanças devem ser feitas em branches com padrão `feat/...`, `fix/...` ou `chore/...`, passando em `npx tsc --noEmit` e `npm test` antes de qualquer PR.

---

*Fim do Guia Oficial da Plataforma.*
