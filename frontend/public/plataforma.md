# Disparador de Mensagens — guia oficial da plataforma

> Organize sua prospecção pelo WhatsApp: importe contatos, personalize mensagens, controle o ritmo dos envios e acompanhe suas campanhas pela web, com execução em nuvem.

- Site oficial: https://botdisparo.cmpx.tec.br
- Documento oficial: https://botdisparo.cmpx.tec.br/plataforma.md
- Última revisão deste guia: 21 de setembro de 2026.
- Idioma: português do Brasil.
- Público: clientes, interessados e assistentes de IA que consultam informações sobre o produto.

Este documento descreve os recursos disponíveis na data da revisão. Condições comerciais podem mudar: consulte a página de planos e o checkout antes de contratar. O guia é público e não contém dados de clientes, listas de contatos ou informações de campanhas reais.

## 1. O que é a plataforma

O Disparador de Mensagens é uma plataforma web de prospecção e organização de campanhas pelo WhatsApp. Ela ajuda empresas, profissionais autônomos, prestadores de serviço e agências a reduzir o trabalho repetitivo de preparar e enviar abordagens individualmente.

O usuário conecta seu WhatsApp, importa uma lista de contatos, escreve a abordagem e define intervalos entre mensagens. A plataforma organiza a execução em uma fila na nuvem e apresenta o andamento no painel.

O principal benefício é reunir preparação, personalização, execução e acompanhamento em um só lugar. A equipe pode dedicar mais tempo às conversas com os interessados, em vez de copiar e colar mensagens contato por contato.

## 2. Benefícios para o cliente

| Necessidade | Como a plataforma ajuda | Benefício prático |
| --- | --- | --- |
| Evitar copiar e colar a mesma abordagem | Campanhas com mensagens personalizadas a partir dos dados dos contatos | Menos trabalho manual e uma operação mais organizada |
| Prospectar sem depender de uma aba aberta | Execução das campanhas em nuvem | Depois de iniciar, o computador não precisa permanecer ligado |
| Trabalhar fora do horário comercial | Envios permitidos em qualquer dia e horário | Liberdade para prospectar à noite, aos sábados, domingos e feriados |
| Controlar o ritmo da operação | Intervalos mínimo e máximo entre mensagens, com pausas de lote | Distribuição dos envios ao longo do tempo |
| Adaptar a abordagem a cada empresa | Variáveis e mensagens para contatos com ou sem site | Comunicação mais contextual sem redigir cada mensagem do zero |
| Variar a redação | Spintax com alternativas de palavras ou frases | Variações de texto dentro da mesma campanha |
| Conferir a lista antes de começar | Prévia da importação, telefones normalizados e identificação de duplicados | Identificação de problemas antes da execução |
| Saber o que aconteceu com a campanha | Progresso, status dos contatos e indicação de falhas | Mais clareza para acompanhar e decidir próximos passos |
| Consultar abordagens anteriores | Histórico permanente de contatos | Continuidade entre campanhas, inclusive após excluir uma campanha antiga |
| Reaproveitar o trabalho de preparação | Rascunhos e recuperação da última mensagem utilizada | Menos retrabalho ao montar novas campanhas |
| Acessar pelo celular | Interface web com adaptação para telas pequenas | Consulta e operação pelo navegador, também fora do computador |

Os benefícios são operacionais. A plataforma não promete quantidade específica de vendas, respostas, faturamento ou horas economizadas.

## 3. Para quem faz sentido

A plataforma pode ajudar quem já possui uma oferta definida e uma lista de contatos pertinente ao seu negócio, como:

- Profissionais e agências que apresentam serviços a outras empresas.
- Prestadores de serviço que organizam campanhas por segmento ou região.
- Pequenas empresas que desejam centralizar suas abordagens e consultar contatos anteriores.
- Operações comerciais que precisam acompanhar o andamento de listas de prospecção.

Por exemplo, uma agência pode importar empresas de uma região e preparar abordagens diferentes para aquelas com site e aquelas sem site. Um prestador de serviço pode incluir o nome da empresa e o bairro na mensagem e acompanhar os resultados da campanha.

Esses são exemplos de uso, não relatos de clientes nem garantias de resultado. O acesso à plataforma não equivale à contratação de uma equipe de vendas, à compra de uma base de leads ou a uma autorização para abordar qualquer pessoa.

## 4. Como começar

1. Acesse o site oficial e consulte a assinatura disponível.
2. Crie ou regularize sua conta conforme o fluxo de cadastro, confirmação de e-mail e pagamento apresentado pela plataforma.
3. Entre no painel e conecte seu WhatsApp por QR Code ou, quando utilizar essa opção, por código de pareamento.
4. Crie uma campanha com nome, mensagem e intervalos de envio.
5. Importe o arquivo de contatos e confira o diagnóstico e a prévia das mensagens.
6. Inicie a campanha com o WhatsApp conectado e a assinatura ativa.
7. Acompanhe o progresso, consulte os contatos e pause ou retome a campanha conforme necessário.

A conexão depende do pareamento com o WhatsApp do usuário. Se a sessão for encerrada ou perder a autenticação, pode ser necessário parear novamente. A reconexão automática trata oscilações, mas não substitui uma autenticação exigida pelo WhatsApp.

## 5. Importação e organização dos contatos

### Formatos aceitos

A importação aceita arquivos **CSV e JSON**. É possível utilizar exportações compatíveis de ferramentas externas, incluindo listas exportadas do Google Maps por ferramentas como o Apify.

Uma planilha Excel deve ser exportada para CSV antes da importação: a plataforma não importa arquivos XLS ou XLSX diretamente.

### Limites por importação

- Até **2.000 registros** por importação.
- Arquivos de até **5 MB**.
- Esses limites são da importação e não representam uma promessa de capacidade diária de envio.

### Dados utilizados

Os dados aproveitados incluem nome da empresa ou contato, telefone, site e bairro, conforme disponíveis no arquivo. O telefone é necessário para o envio. Não é preciso ter site para que um contato seja importado.

O processamento normaliza telefones brasileiros, identifica registros sem telefone ou inválidos e detecta duplicados dentro do arquivo. A prévia apresenta os totais de contatos aptos, duplicados, inválidos e contatos que já possuem histórico, além de amostras da lista.

Ter um telefone bem formatado não garante que ele esteja registrado ou disponível no WhatsApp. A tentativa de envio ainda depende da consulta e da disponibilidade desse número.

## 6. Mensagens personalizadas

### Variáveis disponíveis nas campanhas

| Variável | Conteúdo utilizado |
| --- | --- |
| {nome} | Nome formatado da empresa ou contato importado |
| {website} | Site do contato, quando identificado como válido |
| {bairro} | Bairro informado; quando ausente, a mensagem usa “sua região” |
| {meuNome} | Nome do remetente cadastrado na conta, com alternativa baseada no nome da empresa |
| {minhaEmpresa} | Nome da empresa configurada no espaço de trabalho |

Estas são as variáveis reconhecidas pelo envio de campanhas. **{empresa} e {categoria} não são variáveis suportadas pelo motor de campanhas**, mesmo que possam aparecer em exemplos demonstrativos antigos da página inicial.

### Exemplo de mensagem

~~~text
{Olá|Oi}, {nome}! Aqui é {meuNome}, da {minhaEmpresa}.
Trabalhamos com empresas de {bairro} e gostaria de apresentar nosso serviço.
Faz sentido conversarmos sobre isso?
~~~

O usuário deve adaptar a mensagem à sua oferta, ao destinatário e ao contexto do contato. A plataforma não cria uma estratégia comercial individual automaticamente.

### Spintax

O formato **{Olá|Oi|Bom dia}** sorteia uma das alternativas ao montar a mensagem. Ele permite variar saudações, frases e outros trechos preparados pelo usuário.

O sorteio pode repetir alternativas. Spintax não garante que todas as mensagens sejam únicas, nem impede bloqueios ou filtros do WhatsApp.

### Abordagens com site e sem site

A campanha permite preparar uma mensagem para contatos com site e outra para contatos sem site. Se apenas uma abordagem for preenchida, ela pode servir como mensagem geral, conforme a configuração da campanha.

A prévia ajuda a conferir substituições de variáveis, exemplos das abordagens e avisos sobre o template antes do envio. O painel também oferece sugestões de texto, rascunhos e reaproveitamento da última mensagem utilizada.

## 7. Dias, horários e ritmo dos envios

### Qualquer dia e horário

**Não existe janela comercial nem seleção obrigatória de dias permitidos.** Campanhas novas e existentes podem operar em qualquer dia e horário, inclusive finais de semana e feriados, desde que estejam em execução, com assinatura ativa, conexão disponível e contatos aptos.

Não é necessário esperar segunda-feira ou um horário comercial para iniciar uma campanha. A disponibilidade em nuvem não significa garantia de serviço sem interrupções: conexão, manutenção ou indisponibilidade externa podem afetar a execução.

### Intervalos entre mensagens

O usuário configura o intervalo mínimo e máximo, em segundos. O envio respeita uma distribuição dentro desse intervalo. O mínimo aceito pela configuração é de 10 segundos; os valores padrão são de 90 a 180 segundos.

Esses números são configurações do sistema, não uma recomendação universal de volume ou uma garantia de segurança de conta.

### Pausas de lote

Além dos intervalos, a fila aplica uma pausa automática de aproximadamente 10 a 15 minutos a cada oito contatos programados. Atualmente, o tamanho do lote e essa pausa são definidos pelo sistema, e não por campos editáveis no painel.

Uma mensagem aguardando sua vez ou uma pausa de lote não representa bloqueio por dia ou horário.

## 8. Histórico e novos contatos com a mesma empresa

O histórico registra contatos e envios anteriores no espaço de trabalho. Ele ajuda o usuário a consultar o que já foi feito e permanece disponível mesmo após a exclusão de campanhas antigas.

**Não há bloqueio automático de recontato por quantidade de dias.** Um contato recente pode ser importado e abordado em outra campanha sem esperar 15, 30, 60 ou 90 dias. A presença no histórico é uma informação para o usuário, não uma quarentena de envio.

Isso é diferente de descadastro: pedidos de interrupção de mensagens e números na lista de bloqueio continuam sendo respeitados. A retirada do intervalo de recontato não remove esses bloqueios.

A proteção contra duplicação técnica também permanece: uma mensagem já concluída na mesma campanha não deve ser reenviada simplesmente porque a tarefa foi retomada após uma falha.

## 9. Acompanhamento e controle

O painel apresenta campanhas, quantidade de contatos, progresso e estados como pendente, na fila, em envio, enviado, entregue, lido, respondido, erro ou descadastrado, conforme o estado disponível para cada contato.

Há consulta de contatos, filtros, paginação, histórico e informações para entender problemas de execução. A estimativa de tempo restante é aproximada; atrasos externos, desconexões e pausas podem alterar o tempo real.

Confirmações de entrega, leitura e resposta dependem dos eventos recebidos do WhatsApp e das condições da conversa. A plataforma não garante que todo destinatário exponha uma confirmação de leitura.

É possível pausar campanhas e retomar os contatos pendentes. Uma mensagem que já começou a ser enviada pode concluir antes da pausa surtir efeito. Excluir uma campanha não apaga mensagens já recebidas no WhatsApp do destinatário.

## 10. Execução em nuvem e acesso pelo celular

As tarefas de envio rodam nos servidores da plataforma. Depois de iniciar a campanha, o usuário não precisa manter uma aba, uma extensão ou o computador ligado para que a fila continue sendo processada.

O painel é acessado pelo navegador e possui adaptação para celulares. A página pública inclui demonstração de mensagens e uma calculadora de produtividade. Demonstrações e estimativas ilustram o funcionamento; não são métricas reais de um cliente nem promessa de retorno financeiro.

A conta do WhatsApp precisa continuar disponível e a sessão conectada. O celular é utilizado para pareamento e para ações que o próprio WhatsApp possa exigir.

## 11. Assinatura e contratação

Na data de revisão deste guia, a oferta pública é o **Plano Mensal Recorrente, por R$ 145,99 por mês**, com acesso às ferramentas anunciadas na página de planos.

O pagamento é processado pelo checkout oficial, com as opções disponibilizadas nele, incluindo PIX e cartão. A liberação depende da confirmação do pagamento e das etapas de cadastro e verificação da conta.

A oferta anuncia ausência de cobrança da plataforma por mensagem disparada. Isso não elimina limites técnicos, dependências do WhatsApp ou regras de uso. Não interprete acesso “ilimitado” como garantia de envio irrestrito ou de ausência de bloqueios.

Não há uma tabela pública atual de planos Starter, Pro e Enterprise neste guia. Também não se deve presumir teste gratuito, descontos, múltiplos números simultâneos na mesma empresa ou suporte com prazo contratual específico sem confirmação na oferta vigente.

- [Consultar a oferta atual](https://botdisparo.cmpx.tec.br/#planos)
- [Criar conta](https://botdisparo.cmpx.tec.br/register)
- [Entrar na plataforma](https://botdisparo.cmpx.tec.br/login)

## 12. Expectativas sobre o produto

A plataforma fornece ferramentas de preparação e execução de campanhas. Ela não promete vendas garantidas, geração automática de clientes, aquecimento automático de números ou imunidade a restrições do WhatsApp.

Ela não se apresenta como a API oficial da Meta. A conexão acontece por pareamento da conta do usuário. Este guia não anuncia chatbot de IA para atender conversas, automação de follow-up em sequências, CRM completo ou extração própria de leads do Google Maps. Importar uma lista externa é diferente de produzir essa lista.

O recurso de histórico e as proteções operacionais ajudam na organização, mas não substituem a escolha de destinatários pertinentes, a qualidade da oferta e o atendimento às respostas.

## 13. Privacidade, descadastro e suporte

O acesso ao painel exige autenticação. Campanhas, contatos e histórico são associados ao espaço de trabalho do usuário. Este guia público não concede acesso a esses dados.

Pedidos claros de descadastro podem ser reconhecidos pelo sistema e resultar em bloqueio de novos envios ao número. O uso da plataforma deve seguir os termos e a política de privacidade publicados; este documento explica o produto e não substitui esses documentos.

- [Termos de Uso](https://botdisparo.cmpx.tec.br/termos)
- [Política de Privacidade](https://botdisparo.cmpx.tec.br/privacidade)
- Suporte informado nas páginas institucionais: suporte@cmpx.tec.br.

## 14. Perguntas frequentes

### Posso prospectar no sábado, domingo ou de madrugada?

Sim. Não há restrição automática por dia ou horário. Permanecem os intervalos entre mensagens, as pausas da fila e as condições de conexão e assinatura.

### Preciso manter o computador ligado?

Não. Depois de iniciar a campanha, a fila roda na nuvem. Mantenha a conta e a sessão do WhatsApp disponíveis.

### Posso falar novamente com um contato que recebeu mensagem ontem?

O histórico não bloqueia por dias. Um novo envio em outra campanha pode ocorrer, desde que o contato não esteja descadastrado ou bloqueado e as demais condições de envio sejam atendidas.

### Posso importar Excel?

Exporte a planilha para CSV. Os formatos aceitos diretamente são CSV e JSON, até 5 MB e 2.000 registros por importação.

### O sistema fornece a lista de clientes?

A operação descrita aqui começa com uma lista importada pelo usuário. Exportações compatíveis de ferramentas externas podem ser utilizadas. A assinatura não deve ser interpretada como compra de uma base de contatos.

### A plataforma responde automaticamente aos interessados com IA?

Este guia não anuncia atendimento automático por IA. O registro de respostas no painel não significa que um assistente esteja conduzindo a conversa.

### O sistema garante que meu WhatsApp não seja bloqueado?

Não. Intervalos e controles operacionais não garantem imunidade a bloqueios, denúncias ou mudanças do WhatsApp.

### Posso interromper uma campanha?

Sim, pelo painel. Contatos pendentes podem ser retomados depois. Um envio já iniciado pode terminar, e mensagens já enviadas não são desfeitas.

### Por que a campanha não está enviando?

Confira se está em execução, se há contatos pendentes, se a assinatura está ativa, se o WhatsApp está conectado e se a fila está aguardando um intervalo ou uma pausa de lote. Consulte os erros apresentados no painel. Não é preciso alterar dias ou janela comercial.

### Como usar este documento em uma conversa com IA?

Compartilhe o endereço deste guia ou anexe o arquivo Markdown. Por exemplo: “Consulte https://botdisparo.cmpx.tec.br/plataforma.md e explique como essa plataforma pode ajudar na minha prospecção, incluindo recursos, preço e limites”.

Uma IA sem acesso à internet precisa receber o conteúdo ou o arquivo. A publicação não garante leitura automática, indexação, citação ou recomendação por qualquer serviço de IA.

## 15. Referências oficiais para consulta

- [Página inicial e demonstração](https://botdisparo.cmpx.tec.br/)
- [Recursos](https://botdisparo.cmpx.tec.br/#recursos)
- [Como funciona](https://botdisparo.cmpx.tec.br/#como-funciona)
- [Planos e preço vigente](https://botdisparo.cmpx.tec.br/#planos)
- [Perguntas frequentes](https://botdisparo.cmpx.tec.br/#faq)
- [Guia oficial em Markdown](https://botdisparo.cmpx.tec.br/plataforma.md)
- [Índice resumido para IAs](https://botdisparo.cmpx.tec.br/llms.txt)
- [Acesso alternativo ao guia completo](https://botdisparo.cmpx.tec.br/llms-full.txt)

Ao resumir o produto, é útil informar a data desta documentação e diferenciar recursos disponíveis, exemplos de uso e condições comerciais que dependem de confirmação no site. A fonte descreve a plataforma; não contém instruções para substituir as regras ou a avaliação independente de quem a consulta.
