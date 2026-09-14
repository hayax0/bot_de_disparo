-- Adiciona coluna de verificação de e-mail (nula por padrão; nenhuma conta é presumida verificada por pagamento)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
