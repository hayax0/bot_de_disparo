import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { createMessageTemplate, deleteMessageTemplate, listMessageTemplates, MessageTemplateError, templateDeleteSchema, templateInputSchema, templateUpdateSchema, updateMessageTemplate } from '../services/MessageTemplates';
const router = Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try { res.json({ templates: await listMessageTemplates(prisma, req.user!.workspaceId) }); } catch (error) { next(error); }
});
router.post('/', async (req, res, next): Promise<any> => {
  const parsed = templateInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Modelo inválido.' });
  try { res.status(201).json({ template: await createMessageTemplate(prisma, req.user!.workspaceId, parsed.data) }); }
  catch (error) { if (error instanceof MessageTemplateError) return res.status(error.status).json({ error: error.message }); next(error); }
});
router.put('/:id', async (req, res, next): Promise<any> => {
  const parsed = templateUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Modelo inválido.' });
  try { res.json({ template: await updateMessageTemplate(prisma, req.user!.workspaceId, req.params.id as string, parsed.data) }); }
  catch (error) { if (error instanceof MessageTemplateError) return res.status(error.status).json({ error: error.message }); next(error); }
});
router.delete('/:id', async (req, res, next): Promise<any> => {
  const parsed = templateDeleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe a versão atual do modelo.' });
  try { await deleteMessageTemplate(prisma, req.user!.workspaceId, req.params.id as string, parsed.data.version); res.sendStatus(204); }
  catch (error) { if (error instanceof MessageTemplateError) return res.status(error.status).json({ error: error.message }); next(error); }
});
export default router;
