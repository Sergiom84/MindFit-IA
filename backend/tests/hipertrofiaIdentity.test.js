import test from 'node:test';
import assert from 'node:assert/strict';

import * as backendIdentity from '../services/hipertrofia/identity.js';
// Espejo frontend (JS puro, sin JSX): se importa para garantizar PARIDAD de comportamiento.
import * as frontendIdentity from '../../src/utils/hipertrofiaIdentity.js';

// Alias/variantes que DEBEN reconocerse como Hipertrofia (decisión de producto de Pablo).
const ACCEPTED = [
  'hipertrofia',
  'Hipertrofia',
  'hipertrofiaV2',
  'HipertrofiaV2',
  'hipertrofiav2',
  'HipertrofiaV2_MindFeed',
  // robustez extra: separadores/acentos no deben romper el reconocimiento
  'hipertrofia v2',
  'hipertrofia-v2',
  'HIPERTROFIA'
];

// Valores que NO son Hipertrofia y deben rechazarse SIN caer a gimnasio.
const REJECTED = [
  'gimnasio',
  'gym',
  'bodybuilding',
  'mindfeed',                 // "mindfeed" genérico suelto
  'MindFeed',
  'hipertrofia muscular',     // texto que solo contiene parcialmente "hipertrofia"
  'super hipertrofia total',
  'calistenia',
  'crossfit',
  'powerlifting',
  'funcional',
  '',
  null,
  undefined,
  'desconocido'
];

for (const [label, mod] of [['backend', backendIdentity], ['frontend', frontendIdentity]]) {
  test(`identidad (${label}): reconoce todos los alias históricos de Hipertrofia`, () => {
    for (const value of ACCEPTED) {
      assert.equal(mod.isHipertrofiaMethodology(value), true, `debe aceptar: ${value}`);
      assert.equal(mod.normalizeHipertrofiaIdentity(value), 'hipertrofia', `normaliza: ${value}`);
    }
  });

  test(`identidad (${label}): rechaza gimnasio/bodybuilding/mindfeed genérico y parciales`, () => {
    for (const value of REJECTED) {
      assert.equal(mod.isHipertrofiaMethodology(value), false, `debe rechazar: ${String(value)}`);
      assert.equal(mod.normalizeHipertrofiaIdentity(value), null, `no normaliza: ${String(value)}`);
    }
  });

  test(`identidad (${label}): expone el literal persistido y el nombre visible`, () => {
    assert.equal(mod.HIPERTROFIA_PERSISTED_TYPE, 'HipertrofiaV2_MindFeed');
    assert.equal(mod.HIPERTROFIA_CANONICAL_ID, 'hipertrofia');
    assert.equal(mod.HIPERTROFIA_DISPLAY_NAME, 'Hipertrofia');
    // El literal persistido SIEMPRE se reconoce como Hipertrofia (compat de lectura).
    assert.equal(mod.isHipertrofiaMethodology(mod.HIPERTROFIA_PERSISTED_TYPE), true);
  });
}

test('identidad: paridad EXACTA backend/frontend en toda la matriz', () => {
  for (const value of [...ACCEPTED, ...REJECTED]) {
    assert.equal(
      backendIdentity.isHipertrofiaMethodology(value),
      frontendIdentity.isHipertrofiaMethodology(value),
      `paridad is() para: ${String(value)}`
    );
    assert.equal(
      backendIdentity.normalizeHipertrofiaIdentity(value),
      frontendIdentity.normalizeHipertrofiaIdentity(value),
      `paridad normalize() para: ${String(value)}`
    );
  }
  assert.equal(backendIdentity.HIPERTROFIA_PERSISTED_TYPE, frontendIdentity.HIPERTROFIA_PERSISTED_TYPE);
});
