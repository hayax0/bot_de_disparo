# Perfil profissional para abordagens de IA

O painel oferece um questionário opcional em três partes: apresentação e vínculo com a empresa, serviços e público, e objetivo da abordagem. É possível preencher depois e editar o perfil pela área «Meu negócio».

O perfil fornece contexto às novas gerações de texto. Ele não altera nome ou e-mail de login, dados do workspace, assinatura, carteira ou mensagens já prontas.

## Rotas e privacidade

- `GET /api/profile`: carrega o perfil do usuário autenticado.
- `PUT /api/profile`: cria ou atualiza os campos permitidos.
- `POST /api/profile/defer`: registra que o preenchimento foi adiado.

A identidade do proprietário vem da sessão validada, não de um `userId` enviado pelo navegador. As rotas são protegidas pela autenticação da API; a exigência de confirmação de e-mail é aplicada pela middleware compartilhada quando necessária.

Um snapshot dos campos usados é associado às novas operações de IA. Retentativas da mesma operação preservam esse contexto; edições posteriores do perfil servem às novas gerações e não reescrevem mensagens existentes.

## Uso responsável do contexto

Uma orientação escrita para a campanha tem prioridade sobre o contexto geral do perfil. A IA não deve inventar serviços, preços ou fatos que não foram fornecidos. Revise o texto antes de usá-lo.

A migration inicial do perfil é `20261025223000_professional_profile`. Em produção, migrations são aplicadas pelo procedimento de [DEPLOY.md](../DEPLOY.md).
