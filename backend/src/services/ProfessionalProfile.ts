import { z } from 'zod';

export const professionalProfileSchema = z.object({
  professionalName: z.string().trim().min(2).max(100),
  workMode: z.enum(['SELF_EMPLOYED', 'BUSINESS_OWNER', 'EMPLOYEE']),
  companyName: z.string().trim().max(120).default(''),
  services: z.string().trim().min(5).max(1000),
  targetAudience: z.string().trim().min(3).max(500),
  objective: z.string().trim().min(3).max(500),
}).strict().superRefine((value, context) => {
  if (value.workMode !== 'SELF_EMPLOYED' && value.companyName.length < 2) {
    context.addIssue({ code: 'custom', path: ['companyName'], message: 'Informe o nome da empresa.' });
  }
});

export type ProfessionalContext = z.infer<typeof professionalProfileSchema>;

// Só perfis concluídos são usados pela IA. Conteúdo é dado de contexto, não instrução de sistema.
export function profileContext(profile: unknown): ProfessionalContext | undefined {
  if (!profile || typeof profile !== 'object' || !('completedAt' in profile) || !profile.completedAt) return undefined;
  const { professionalName, workMode, companyName, services, targetAudience, objective } = profile as Record<string, unknown>;
  const parsed = professionalProfileSchema.safeParse({ professionalName, workMode, companyName, services, targetAudience, objective });
  return parsed.success ? parsed.data : undefined;
}
