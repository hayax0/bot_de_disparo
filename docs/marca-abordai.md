# Marca Abordai

Abordai é o nome público da plataforma de prospecção, campanhas de WhatsApp e CRM. O símbolo vetorial versionado fica em `frontend/public/abordai-mark.svg`; o gerador de ativos é `frontend/scripts/generate-brand-assets.mjs`.

## Domínio e serviços

O domínio canônico configurado é `https://abordai.cmpx.tec.br`. O host anterior `botdisparo.cmpx.tec.br` redireciona páginas para o domínio novo, preservando caminho e query string; as rotas `/api/` no host antigo continuam sendo encaminhadas ao backend para compatibilidade.

Os exemplos de produção usam `PLATFORM_URL`, `NEXT_PUBLIC_APP_URL` e `CORS_ORIGIN` com o domínio canônico. O frontend chama a API pela mesma origem em `/api`. A configuração versionada está em `infra/nginx/abordai.conf` e `docker-compose.production.yml`.

## Ativos e e-mail

A marca aparece no site, painel, autenticação, páginas legais e e-mails transacionais. O remetente padrão de produção está configurado no exemplo de ambiente como `Abordai <noreply@abordai.cmpx.tec.br>`; funcionamento e verificação do domínio dependem da configuração externa do Resend e dos registros DNS.

Para regenerar imagens e favicon, execute `node frontend/scripts/generate-brand-assets.mjs` a partir da raiz do repositório. O gerador parte do SVG versionado.

## Integrações externas

Alterações de nome ou imagem em Cakto, Resend, redes sociais e materiais comerciais precisam ser feitas nos respectivos serviços. Não altere IDs de ofertas ou configurações de webhook só por causa da marca. A configuração no repositório não prova, por si só, o estado atual desses serviços.

Links, cache do navegador e indexação de buscadores podem demorar a refletir mudanças. O login no domínio novo pode solicitar autenticação novamente porque o armazenamento do navegador é separado por origem.
