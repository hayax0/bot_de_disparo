import test from 'node:test';
import assert from 'node:assert/strict';
import { prospectingSuggestions } from './ProspectingSuggestions';
const profile = { completedAt: new Date(), professionalName: 'Ana', workMode: 'SELF_EMPLOYED', companyName: '', services: 'Criação de sites', targetAudience: 'Clínicas; Restaurantes', objective: 'Agendar reuniões' };
test('Sugestões gratuitas usam público e oferta do perfil, sem inventar localização', () => {
  const result = prospectingSuggestions(profile);
  assert.deepEqual(result.map(row => [row.segment, row.websiteFilter]), [['Clínicas', 'WITHOUT_WEBSITE'], ['Restaurantes', 'WITHOUT_WEBSITE']]);
  assert.ok(result.every(row => !('location' in row)));
  assert.equal(prospectingSuggestions({ ...profile, services: 'Tráfego pago' })[0].websiteFilter, 'ALL');
});
test('Perfil adiado ou inválido não produz público fictício', () => {
  assert.deepEqual(prospectingSuggestions(null), []);
  assert.deepEqual(prospectingSuggestions({ ...profile, completedAt: null }), []);
  assert.deepEqual(prospectingSuggestions({ ...profile, services: '' }), []);
});
