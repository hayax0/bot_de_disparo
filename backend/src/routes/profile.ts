import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { prospectingSuggestions } from '../services/ProspectingSuggestions';
import { professionalProfileSchema } from '../services/ProfessionalProfile';

const router = Router();
router.use(authenticate);
router.get('/prospecting-suggestions', async (req, res) => {
  try {
    const profile = await prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    res.json({ suggestions: prospectingSuggestions(profile), profileCompleted: Boolean(profile?.completedAt), costCredits: 0 });
  } catch { res.status(500).json({ error: 'Não foi possível carregar as sugestões. Você pode preencher a busca manualmente.' }); }
});
router.get('/', async (req, res) => {
  try {
    const profile = await prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    res.json({ profile });
  } catch { res.status(500).json({ error: 'Não foi possível carregar seu perfil profissional.' }); }
});
router.put('/', async (req, res) => {
  const input = professionalProfileSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: 'Confira os campos do perfil profissional.', fields: input.error.flatten().fieldErrors });
    return;
  }
  try {
    const userId = req.user!.userId;
    const data = { ...input.data, completedAt: new Date(), dismissedAt: null };
    const profile = await prisma.professionalProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    res.json({ profile });
  } catch { res.status(500).json({ error: 'Não foi possível salvar seu perfil profissional.' }); }
});
router.post('/defer', async (req, res) => {
  try {
    const userId = req.user!.userId;
    await prisma.professionalProfile.upsert({ where: { userId }, create: { userId, dismissedAt: new Date() }, update: { dismissedAt: new Date() } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Não foi possível adiar o questionário. Tente novamente.' }); }
});
export default router;
