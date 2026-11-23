# Abordai — documentação da plataforma

> Revisado em 23 de novembro de 2026. Valores comerciais e recursos descritos abaixo refletem a configuração versionada; confirme as ofertas externas antes de divulgá-las.

## O produto

O Abordai reúne prospecção de empresas, campanhas de WhatsApp, geração de mensagens com IA e acompanhamento comercial. O painel é feito em Next.js; a API usa Express, Prisma/PostgreSQL e Redis com BullMQ. As sessões de WhatsApp são gerenciadas pelo Baileys.

A navegação entre áreas do painel fica no menu lateral. O domínio público configurado é `https://abordai.cmpx.tec.br`; a API usa a mesma origem em `/api`.

## Buscar empresas

1. O usuário conecta uma credencial pessoal da Apify na área de busca.
2. A API inicia o Actor `compass~crawler-google-places`, com nicho e cidade informados e país Brasil.
3. Os resultados são filtrados e persistidos; quando o dataset da Apify publica dados parciais, o mapa pode atualizar os pontos durante a execução.

A busca usa a conta Apify do usuário e pode ser cobrada por esse provedor, inclusive quando há resultados descartados. Ela não consome créditos de IA da plataforma. Novas buscas não usam a chave global `APIFY_API_TOKEN`; essa variável existe para compatibilidade com execuções históricas.

O mapa é Leaflet com tiles do OpenStreetMap e pinos derivados das coordenadas dos resultados Apify. Não é Google Maps e não precisa de chave Google Maps. Um resultado sem coordenadas não pode aparecer como pino.

## Campanhas e IA

A geração de mensagens é uma operação em segundo plano. O usuário pode acompanhar o progresso, deixar a operação continuar e voltar depois. Antes do envio, a campanha passa por uma revisão de contatos selecionados e textos finais. A revisão aceita até 500 contatos por lote; a confirmação é explícita e o fechamento da janela não envia mensagens.

A geração ou regeneração bem-sucedida consome créditos de IA conforme as regras da carteira. Edição manual não consome créditos. Uma nova geração pode consumir novamente; confirme o saldo e a estimativa exibidos no painel.

Mensagens são enfileiradas no BullMQ e processadas pelo worker. O espaçamento entre envios vem da configuração da campanha e há pausas adicionais entre lotes. Esses mecanismos não garantem entrega nem evitam restrições impostas pelo WhatsApp.

## CRM e vendas

O CRM fica nas áreas comerciais do menu lateral. Contatos são deduplicados pelo telefone dentro do workspace. O quadro permite mover contatos entre etapas; a etapa «Venda realizada» requer registrar valor e data.

O gráfico comercial soma vendas registradas manualmente no CRM. Ele permite períodos de 7 dias, 30 dias, mês, ano e intervalo personalizado; agrupa por dia, semana ou mês, compara com o período anterior e exibe faturamento, quantidade e ticket médio. Atualiza a cada 30 segundos enquanto a página está visível e após alterações comerciais. Não é uma atribuição automática de receita a campanhas.

## Planos e cobranças

O catálogo no código (`backend/src/config/plans.ts`) define START Essencial por R$ 27,99/mês, PRO Profissional por R$ 55,99/mês e SCALE Premium por R$ 95,99/mês. Os limites configurados são 1.000/3.000/6.000 disparos por ciclo e 50/150/300 créditos mensais de IA; cada plano prevê uma conexão WhatsApp.

Pacotes de recarga configurados: 100 créditos por R$ 9,99; 300 por R$ 24,99; 700 por R$ 49,99. Créditos mensais são renovados no ciclo e consumidos antes dos créditos comprados; créditos comprados não expiram.

A API autenticada retorna o catálogo e as URLs de checkout Cakto configuradas. A existência de uma URL no código não confirma que a oferta esteja ativa no painel externo, nem que o pagamento tenha sido aprovado. A ativação depende do webhook Cakto validado.

Os privilégios de administrador dependem do papel `ADMIN` atual; contas legadas têm regras próprias. Não interprete isso como acesso vitalício geral para qualquer conta.

## Fontes de referência

- Planos: [backend/src/config/plans.ts](backend/src/config/plans.ts).
- Busca e persistência Apify: [backend/src/services/CompanySearchService.ts](backend/src/services/CompanySearchService.ts).
- Mapa: [frontend/src/components/dashboard/SearchLiveMap.tsx](frontend/src/components/dashboard/SearchLiveMap.tsx).
- Gráfico: [frontend/src/components/dashboard/SalesChart.tsx](frontend/src/components/dashboard/SalesChart.tsx).
- Fluxo de deploy: [DEPLOY.md](DEPLOY.md).
- Regras de contribuição: [AGENTS.md](AGENTS.md).
