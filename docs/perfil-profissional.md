# Perfil profissional para abordagens de IA

O primeiro acesso ao painel apresenta um questionário opcional de três etapas para contas novas e existentes: apresentação/vínculo com empresa; serviços e público; objetivo da abordagem. “Preencher depois” persiste o adiamento para não repetir o modal a cada login. “Meu negócio” permanece no painel para preencher/editar quando quiser.

O nome informado é a apresentação profissional usada na IA; não altera identidade de login, nome antigo do workspace ou dados contratuais. Salvar/editar/adiar não cobra créditos nem modifica assinatura, carteira, campanhas ou mensagens existentes.

GET/PUT /api/profile e POST /api/profile/defer exigem autenticação e e-mail verificado. O proprietário é sempre obtido do token validado; não aceita userId nem campos de conta no corpo. O perfil é privado por usuário e compartilhado apenas como contexto das gerações solicitadas por ele.

Perfis incompletos/adiados não são usados como contexto. Na criação de cada operação individual/em lote, um snapshot dos campos profissionais é salvo na operação. Retentativas mantêm o snapshot, mensagens prontas não são reescritas e somente operações novas incorporam edições do perfil. Operações anteriores à migration preservam o comportamento sem perfil.

A orientação explícita da campanha/geração tem prioridade sobre o perfil. Mensagens continuam curtas e exigem revisão pelo usuário; dados do perfil não substituem regras de segurança nem permitem inventar informações. Na geração em lote, o serviço do perfil preenche a oferta inicial apenas quando não há oferta anterior nem texto digitado; na geração individual, serviços do perfil servem como fallback se campanha e orientação estiverem vazias.

Migration aditiva: 20261025223000_professional_profile. Adiciona ProfessionalProfile e AiOperation.profileSnapshot, sem backfill ou alteração das contas existentes. Efetuar backup antes do deploy e aplicar prisma migrate deploy com a nova imagem antes da ativação.
