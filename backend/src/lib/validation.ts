import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// Middleware genérico para validação de Body com retorno padronizado em pt-BR
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): any => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? firstIssue.message : 'Dados fornecidos inválidos.';
      return res.status(400).json({ error: message });
    }
    req.body = result.data;
    next();
  };
}

// Middleware genérico para validação de Query com retorno padronizado em pt-BR
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): any => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue ? firstIssue.message : 'Parâmetros de consulta inválidos.';
      return res.status(400).json({ error: message });
    }
    try {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      (req as any).query = result.data;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}

// ── SCHEMAS DE AUTENTICAÇÃO E CONTA ─────────────────────────────────

export const loginSchema = z.object({
  email: z.string({ message: 'E-mail é obrigatório.' })
    .email('Formato de e-mail inválido.')
    .max(254, 'E-mail não pode exceder 254 caracteres.')
    .transform(e => e.trim().toLowerCase()),
  password: z.string({ message: 'Senha é obrigatória.' })
    .min(1, 'Senha não pode ser vazia.')
    .max(72, 'Senha não pode exceder 72 caracteres.')
});

export const confirmCodeSchema = z.object({
  email: z.string({ message: 'E-mail é obrigatório.' })
    .email('Informe um e-mail válido.')
    .max(254, 'E-mail não pode exceder 254 caracteres.')
    .transform(e => e.trim().toLowerCase())
});

export const registerSchema = z.object({
  email: z.string({ message: 'E-mail é obrigatório.' })
    .email('Formato de e-mail inválido.')
    .max(254, 'E-mail não pode exceder 254 caracteres.')
    .transform(e => e.trim().toLowerCase()),
  password: z.string({ message: 'Senha é obrigatória.' })
    .min(6, 'A senha deve conter no mínimo 6 caracteres.')
    .max(72, 'A senha não pode exceder 72 caracteres.'),
  name: z.string().max(120, 'Nome muito longo.').optional().nullable(),
  termsAccepted: z.union([z.boolean(), z.string()]).refine(
    val => val === true || val === 'true',
    { message: 'É obrigatório ler e aceitar os Termos de Uso e a Política de Privacidade para criar uma conta.' }
  ),
  verificationCode: z.string().optional().nullable()
});

export const forgotPasswordSchema = z.object({
  email: z.string({ message: 'E-mail é obrigatório.' })
    .email('Informe um e-mail válido.')
    .max(254, 'E-mail não pode exceder 254 caracteres.')
    .transform(e => e.trim().toLowerCase())
});

export const resetPasswordSchema = z.object({
  token: z.string({ message: 'Token de recuperação é obrigatório.' })
    .min(10, 'Token inválido.')
    .max(128, 'Token inválido.'),
  newPassword: z.string({ message: 'Nova senha é obrigatória.' })
    .min(6, 'A nova senha deve conter no mínimo 6 caracteres.')
    .max(72, 'A nova senha não pode exceder 72 caracteres.')
});

// ── SCHEMAS DE CAMPANHA E WHATSAPP ──────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string({ message: 'O nome da campanha é obrigatório.' })
    .min(1, 'O nome da campanha é obrigatório.')
    .max(120, 'O nome da campanha não pode ultrapassar 120 caracteres.')
    .transform(n => n.trim()),
  messageComSite: z.string().max(4000, 'Mensagem com site muito longa.').optional().nullable(),
  messageSemSite: z.string().max(4000, 'Mensagem sem site muito longa.').optional().nullable(),
  delayMin: z.coerce.number()
    .int('Delay mínimo deve ser um número inteiro.')
    .min(10, 'O delay mínimo deve ser maior ou igual a 10 segundos.')
    .default(90),
  delayMax: z.coerce.number()
    .int('Delay máximo deve ser um número inteiro.')
    .min(10, 'O delay máximo deve ser maior ou igual a 10 segundos.')
    .default(180),
  scheduleStartMinute: z.coerce.number()
    .int('Minuto inicial deve ser um número inteiro.')
    .min(0, 'Minuto inicial deve ser entre 0 e 1439.')
    .max(1439, 'Minuto inicial deve ser entre 0 e 1439.')
    .default(480),
  scheduleEndMinute: z.coerce.number()
    .int('Minuto final deve ser um número inteiro.')
    .min(0, 'Minuto final deve ser entre 0 e 1439.')
    .max(1439, 'Minuto final deve ser entre 0 e 1439.')
    .default(1200),
  scheduleDays: z.string()
    .regex(/^([0-6],)*[0-6]$/, 'Dias de envio devem ser números de 0 a 6 separados por vírgula (ex: 1,2,3,4,5,6).')
    .default('1,2,3,4,5,6'),
  scheduleTimezone: z.string()
    .refine(tz => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, { message: 'Fuso horário (timezone) IANA inválido.' })
    .default('America/Sao_Paulo'),
  recontactAfterDays: z.coerce.number()
    .int('Dias de recontato deve ser um número inteiro.')
    .min(0, 'Dias de recontato deve ser positivo ou 0 para desabilitar.')
    .max(365, 'Dias de recontato não pode exceder 365 dias.')
    .default(30)
}).refine(data => data.delayMax >= data.delayMin, {
  message: 'O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.',
  path: ['delayMax']
}).refine(data => data.scheduleEndMinute > data.scheduleStartMinute, {
  message: 'O horário de término da janela deve ser posterior ao horário de início.',
  path: ['scheduleEndMinute']
}).refine(data => {
  const com = data.messageComSite?.trim();
  const sem = data.messageSemSite?.trim();
  return Boolean(com || sem);
}, {
  message: 'Informe ao menos uma mensagem para a campanha (com site, sem site ou geral).',
  path: ['messageComSite']
});

export const whatsappPairSchema = z.object({
  phone: z.string({ message: 'Número de telefone é obrigatório.' })
    .min(8, 'Número de telefone inválido.')
    .max(25, 'Número de telefone inválido.')
    .transform(p => p.trim())
});

// ── SCHEMAS DE HISTÓRICO E PAGINAÇÃO ────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional().default('')
});

// ── SCHEMAS LGPD E CONTATO (FASE 3 READINESS) ───────────────────────

export const blacklistContactSchema = z.object({
  phone: z.string({ message: 'Número de telefone é obrigatório.' })
    .min(8, 'Número de telefone inválido.')
    .max(25, 'Número de telefone inválido.'),
  reason: z.string().max(255).optional().default('MANUAL'),
  scope: z.enum(['GLOBAL', 'WORKSPACE']).optional().default('WORKSPACE')
});

export const anonymizeContactSchema = z.object({
  phone: z.string({ message: 'Número de telefone é obrigatório.' })
    .min(8, 'Número de telefone inválido.')
    .max(25, 'Número de telefone inválido.')
});
