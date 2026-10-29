import { profileContext } from './ProfessionalProfile';

// Regras locais e gratuitas: nenhuma chamada ao provedor nem inferência de cidade ou faturamento.
export function prospectingSuggestions(profile: unknown) {
  const context = profileContext(profile);
  if (!context) return [];
  const createsSites = /\b(site|sites|website|websites|landing page|landing pages)\b/i.test(context.services);
  const audiences = context.targetAudience.split(/[,;\n]|\s+e\s+/i).map(value => value.trim()).filter(value => value.length >= 3).slice(0, 3);
  return audiences.map((segment, index) => ({
    id: `profile-${index}`,
    segment: segment.slice(0, 120),
    websiteFilter: createsSites ? 'WITHOUT_WEBSITE' : 'ALL',
    reason: createsSites
      ? 'Seu perfil oferece criação de sites. Empresas sem site próprio podem ser um ponto de partida.'
      : 'Este segmento foi informado no público do seu perfil. Ajuste a busca à sua oferta atual.',
  }));
}
