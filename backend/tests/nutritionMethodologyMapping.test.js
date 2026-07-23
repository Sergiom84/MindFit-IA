import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMethodologyKey, isPlanAutoregSupported } from '../services/progression/planAutoregService.js';
import { mapMethodologyToTrainingType } from '../services/nutritionV2/menuDataAccess.js';
import { isHipertrofiaMethodology } from '../services/hipertrofia/identity.js';

const ACCEPTED = [
  'hipertrofia',
  'Hipertrofia',
  'hipertrofiaV2',
  'HipertrofiaV2',
  'HipertrofiaV2_MindFeed',
  'hipertrofia v2',
  'hipertrofia-v2'
];

const REJECTED = [
  'hipertrofia muscular',
  'super hipertrofia total',
  'mindfeed',
  'gimnasio',
  'gym',
  'bodybuilding'
];

test('nutrición: Hipertrofia canónica y aliases históricos mapean a training_type hipertrofia', () => {
  for (const value of ACCEPTED) {
    assert.equal(isHipertrofiaMethodology(value), true, `helper acepta ${value}`);
    assert.equal(mapMethodologyToTrainingType(value), 'hipertrofia', `${value} -> hipertrofia`);
  }
});

test('nutrición: no hay falsos positivos por substring en el mapeo de metodología', () => {
  for (const value of REJECTED) {
    assert.equal(isHipertrofiaMethodology(value), false, `helper rechaza ${value}`);
    assert.notEqual(mapMethodologyToTrainingType(value), 'hipertrofia', `${value} no debe mapear a hipertrofia`);
  }
});

test('nutrición: fuerza y resistencia conservan sus mapeos', () => {
  assert.equal(mapMethodologyToTrainingType('powerlifting'), 'fuerza');
  assert.equal(mapMethodologyToTrainingType('heavy-duty'), 'fuerza');
  assert.equal(mapMethodologyToTrainingType('crossfit'), 'general');
  assert.equal(mapMethodologyToTrainingType('oposicion'), 'resistencia');
});

test('autorregulación: Hipertrofia no entra por coincidencias laxas y no activa el plan multisemana', () => {
  for (const value of ['hipertrofia', 'HipertrofiaV2', 'HipertrofiaV2_MindFeed']) {
    assert.equal(normalizeMethodologyKey(value), 'hipertrofia');
    assert.equal(isPlanAutoregSupported(value), false);
  }

  for (const value of ['hipertrofia muscular', 'super hipertrofia total', 'mindfeed']) {
    assert.equal(normalizeMethodologyKey(value), null);
    assert.equal(isPlanAutoregSupported(value), false);
  }
});
