import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePreferredMethodology,
  recommendMethodologyFromProfile,
  buildProfileAwarePlanData
} from '../services/userProfileContract.js';
import { isHipertrofiaMethodology } from '../services/hipertrofia/identity.js';

// Fase 4: una preferencia EXPLÍCITA de Hipertrofia (o alias histórico) NO debe caer al
// generador genérico de gimnasio. gimnasio/gym/bodybuilding siguen siendo gimnasio.

test('contrato: Hipertrofia explícita resuelve a identidad canónica (no gimnasio)', () => {
  for (const alias of ['hipertrofia', 'Hipertrofia', 'hipertrofiaV2', 'HipertrofiaV2', 'HipertrofiaV2_MindFeed']) {
    assert.equal(normalizePreferredMethodology(alias), 'hipertrofia', `${alias} -> hipertrofia`);
  }
});

test('contrato: gimnasio/gym/bodybuilding siguen siendo el gimnasio genérico', () => {
  assert.equal(normalizePreferredMethodology('gimnasio'), 'gimnasio');
  assert.equal(normalizePreferredMethodology('gym'), 'gimnasio');
  assert.equal(normalizePreferredMethodology('bodybuilding'), 'gimnasio');
  // Y NO son Hipertrofia (el guard de redirección no debe dispararse para ellos).
  assert.equal(isHipertrofiaMethodology('gimnasio'), false);
  assert.equal(isHipertrofiaMethodology('gym'), false);
  assert.equal(isHipertrofiaMethodology('bodybuilding'), false);
});

test('recomendación: preferencia/solicitud explícita de Hipertrofia -> flujo dedicado', () => {
  assert.equal(recommendMethodologyFromProfile({ metodologia_preferida: 'hipertrofia' }), 'hipertrofia');
  assert.equal(recommendMethodologyFromProfile({ metodologia_preferida: 'HipertrofiaV2_MindFeed' }), 'hipertrofia');
  assert.equal(recommendMethodologyFromProfile({}, 'hipertrofiaV2'), 'hipertrofia');
  // El consumidor la detecta como Hipertrofia y redirige (no genera gimnasio).
  assert.equal(isHipertrofiaMethodology(recommendMethodologyFromProfile({ metodologia_preferida: 'hipertrofia' })), true);
});

test('recomendación: objetivos que legítimamente recomiendan gimnasio lo siguen haciendo', () => {
  assert.equal(recommendMethodologyFromProfile({ objetivo_principal: 'ganar_masa_muscular' }), 'gimnasio');
  assert.equal(recommendMethodologyFromProfile({ objetivo_principal: 'tonificar' }), 'gimnasio');
  assert.equal(recommendMethodologyFromProfile({ objetivo_principal: 'ganar_peso' }), 'gimnasio');
  // Un objetivo->gimnasio NO se confunde con Hipertrofia (no se redirige).
  assert.equal(isHipertrofiaMethodology(recommendMethodologyFromProfile({ objetivo_principal: 'ganar_masa_muscular' })), false);
});

test('buildProfileAwarePlanData: preferencia Hipertrofia propaga la identidad dedicada', () => {
  const built = buildProfileAwarePlanData({}, { metodologia_preferida: 'hipertrofia' });
  assert.equal(built.methodology, 'hipertrofia');
  assert.equal(isHipertrofiaMethodology(built.methodology), true);
});
