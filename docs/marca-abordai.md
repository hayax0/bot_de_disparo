# Marca Abordai

Abordai é o nome público da plataforma: encontrar empresas, personalizar abordagens com IA e acompanhar campanhas no WhatsApp. O símbolo é um monograma “a” com balão de conversa, em verde menta sobre fundo escuro. A fonte vetorial fica em frontend/public/abordai-mark.svg; execute node frontend/scripts/generate-brand-assets.mjs para regenerar PNGs e favicon ICO (16 a 256 px). Site e e-mails usam logo-abordai-v1.png para separar o cache da marca anterior.

A mudança contempla landing page, painel, autenticação, páginas legais, metadados de busca/compartilhamento e todos os e-mails transacionais. O remetente exibe Abordai mantendo o endereço verificado no Resend.

## Continuidade

O endereço atual https://botdisparo.cmpx.tec.br continua válido. Não renomear banco, repositório, serviços Docker, filas, chaves de armazenamento ou identificadores de integração por causa da marca. Não alterar IDs/aliases de produtos antigos na Cakto: eles ainda reconhecem eventos de assinaturas existentes.

## Configurações externas

- Cakto: atualizar nome e imagem públicos dos produtos/ofertas atuais, preservando IDs, preços, recorrências e webhooks.
- Redes sociais, materiais de divulgação e perfis de suporte: atualizar nome e apresentações.
- Domínio próprio: opcional e separado. Antes da mudança, configurar DNS, TLS, redirecionamentos do endereço antigo, CORS, links de e-mail e integrações. Não remover o domínio atual antecipadamente.
- Registrar marca e verificar disponibilidade jurídica/comercial antes de investir em divulgação: a troca no código não comprova exclusividade do nome.

E-mails já recebidos, prévias de compartilhamento e resultados de buscadores podem manter o nome anterior até atualização de cache/indexação.

## Endereço principal

O endereço principal passa a ser https://abordai.cmpx.tec.br. O endereço antigo redireciona páginas mantendo caminho e query string. A rota /api/ antiga continua sendo encaminhada diretamente ao backend para preservar webhooks e integrações.

Configuração versionada em infra/nginx/abordai.conf. Emitir o certificado do novo nome antes de instalar essa configuração; manter os dois certificados com renovação automática. Na VPS, PLATFORM_URL deve apontar ao novo endereço e CORS_ORIGIN deve permitir os dois endereços durante a transição. O domínio abordai.cmpx.tec.br foi verificado no Resend com registros DKIM e SPF. O remetente transacional é Abordai <noreply@abordai.cmpx.tec.br>. Manter os registros antigos durante a transição e o reply-to de suporte existente.

O login poderá ser solicitado novamente no novo endereço, pois o armazenamento do navegador é separado por origem. Contas, senhas, campanhas e saldos são os mesmos.
