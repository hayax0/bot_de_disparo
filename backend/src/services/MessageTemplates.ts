import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const templateInputSchema = z.object({
  title: z.string().trim().min(1, 'Dê um nome ao modelo.').max(80),
  service: z.string().trim().max(80),
  content: z.string().trim().min(1, 'Escreva a mensagem do modelo.').max(2000),
}).strict();
export const templateUpdateSchema = templateInputSchema.extend({ version: z.number().int().min(1) }).strict();
export const templateDeleteSchema = z.object({ version: z.number().int().min(1) }).strict();
export class MessageTemplateError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function listMessageTemplates(db: PrismaClient, workspaceId: string) {
  return db.messageTemplate.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }] });
}
export async function createMessageTemplate(db: PrismaClient, workspaceId: string, input: z.infer<typeof templateInputSchema>) {
  return db.$transaction(async tx => {
    // Serializa a cota de registros, inclusive duas criações simultâneas na mesma conta.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`message_templates:${workspaceId}`}))`;
    if (await tx.messageTemplate.count({ where: { workspaceId } }) >= 200) throw new MessageTemplateError('Você já tem 200 modelos. Exclua um modelo antes de salvar outro.', 409);
    return tx.messageTemplate.create({ data: { ...input, workspaceId } });
  });
}
export async function updateMessageTemplate(db: PrismaClient, workspaceId: string, id: string, input: z.infer<typeof templateUpdateSchema>) {
  return db.$transaction(async tx => {
    const current = await tx.messageTemplate.findFirst({ where: { id, workspaceId } });
    if (!current) throw new MessageTemplateError('Modelo não encontrado.', 404);
    const { version, ...data } = input;
    const result = await tx.messageTemplate.updateMany({ where: { id, workspaceId, version }, data: { ...data, version: { increment: 1 } } });
    if (!result.count) throw new MessageTemplateError('Este modelo mudou em outra janela. Seu rascunho foi preservado; carregue a versão atual antes de salvar.', 409);
    return tx.messageTemplate.findFirstOrThrow({ where: { id, workspaceId } });
  });
}
export async function deleteMessageTemplate(db: PrismaClient, workspaceId: string, id: string, version: number) {
  return db.$transaction(async tx => {
    const current = await tx.messageTemplate.findFirst({ where: { id, workspaceId } });
    if (!current) throw new MessageTemplateError('Modelo não encontrado.', 404);
    const result = await tx.messageTemplate.deleteMany({ where: { id, workspaceId, version } });
    if (!result.count) throw new MessageTemplateError('Este modelo mudou em outra janela. Atualize a lista antes de tentar excluí-lo novamente.', 409);
  });
}
