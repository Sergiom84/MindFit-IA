/**
 * Gates de regresión para los fixes de la auditoría HipertrofiaV2/Nutrición
 * (2026-07-17). Cubre C-01 (alergias semánticas), A-01 (nivel), A-02 (ruleset
 * por nivel), A-03 (frecuencia) y A-04 (balance de menú). Todo con funciones
 * puras / mocks, sin tocar la BD (corre en test:unit).
 *
 * Ejecutar con: node backend/tests/auditoriaHipertrofiaV2Fixes.test.js
 */

import { foodTriggersAllergen, expandAllergenTerms } from '../services/nutritionUtils.js';
import { resolveScopeForLevel } from '../services/hipertrofia/rulesetService.js';
import { resolveCycleSessions } from '../services/hipertrofia/sessionService.js';
import { evaluateHipertrofiaLevel } from '../services/hipertrofia/levelEvaluator.js';
import { evaluateCandidateMealBalance } from '../services/nutritionV2/mealSelectionHelpers.js';
import { activeInjuryRules, isContraindicated } from '../services/routineGeneration/injuryContraindications.js';

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
    },
    toBeTrue() {
      if (value !== true) throw new Error(`Expected true, got ${JSON.stringify(value)}`);
    },
    toBeFalse() {
      if (value !== false) throw new Error(`Expected false, got ${JSON.stringify(value)}`);
    }
  };
}

// Los tests con dbClient mock son async; los acumulamos y esperamos al final.
const asyncTests = [];
function asyncTest(description, fn) {
  asyncTests.push(async () => {
    try {
      await fn();
      console.log(`✅ ${description}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${description}`);
      console.error(`   Error: ${error.message}`);
      failed++;
    }
  });
}

// ============ C-01: alergias semánticas por derivados ============
test('C-01: Natto (soja sin tag) se bloquea para alergia a soja', () => {
  expect(foodTriggersAllergen('Natto', [], 'soja')).toBeTrue();
});
test('C-01: Tofu con tag soja se bloquea', () => {
  expect(foodTriggersAllergen('Tofu firme', ['soja'], 'soja')).toBeTrue();
});
test('C-01: "Arroz sin gluten" NO se bloquea para alergia a gluten (negación)', () => {
  expect(foodTriggersAllergen('Arroz basmati', ['sin gluten'], 'gluten')).toBeFalse();
});
test('C-01: alimento neutro no se bloquea', () => {
  expect(foodTriggersAllergen('Pechuga de pollo', [], 'soja')).toBeFalse();
});
test('C-01: expandAllergenTerms incluye derivados de soja', () => {
  const terms = expandAllergenTerms('soja');
  expect(terms.includes('natto')).toBeTrue();
  expect(terms.includes('tofu')).toBeTrue();
});

// ============ A-01: evaluación de nivel ============
const mockDb = (row) => ({ query: async () => ({ rows: row ? [row] : [] }) });

asyncTest('A-01: nivel declarado "intermedio" → Intermedio (fuente declarado)', async () => {
  const ev = await evaluateHipertrofiaLevel(mockDb({ nivel_entrenamiento: 'intermedio', anos_entrenando: 3 }), 1);
  expect(ev.nivel_hipertrofia).toBe('Intermedio');
  expect(ev.source).toBe('declarado');
});
asyncTest('A-01: sin nivel declarado, 5 años → Avanzado (derivado)', async () => {
  const ev = await evaluateHipertrofiaLevel(mockDb({ nivel_entrenamiento: null, anos_entrenando: 5 }), 1);
  expect(ev.nivel_hipertrofia).toBe('Avanzado');
  expect(ev.source).toBe('derivado_anos');
});
asyncTest('A-01: principiante con 0 años → Principiante con tag novato', async () => {
  const ev = await evaluateHipertrofiaLevel(mockDb({ nivel_entrenamiento: 'principiante', anos_entrenando: 0 }), 1);
  expect(ev.nivel_hipertrofia).toBe('Principiante');
  expect(ev.tags_adaptacion.includes('novato')).toBeTrue();
});

// ============ A-02: ruleset por nivel ============
test('A-02: resolveScopeForLevel mapea cada nivel a su scope', () => {
  expect(resolveScopeForLevel('Principiante')).toBe('hipertrofia_v2_principiante');
  expect(resolveScopeForLevel('Intermedio')).toBe('hipertrofia_v2_intermedio');
  expect(resolveScopeForLevel('Avanzado')).toBe('hipertrofia_v2_avanzado');
});
test('A-02: tolera acentos/mayúsculas y cae en principiante si es desconocido', () => {
  expect(resolveScopeForLevel('avanzado')).toBe('hipertrofia_v2_avanzado');
  expect(resolveScopeForLevel('desconocido')).toBe('hipertrofia_v2_principiante');
  expect(resolveScopeForLevel(null)).toBe('hipertrofia_v2_principiante');
});

// ============ A-03: frecuencia real ============
const mockSessions = [
  { cycle_day: 1, session_name: 'Empuje Principal', muscle_groups: ['Pecho', 'Tríceps'], is_heavy_day: true, intensity_percentage: 80 },
  { cycle_day: 2, session_name: 'Tirón Principal', muscle_groups: ['Espalda', 'Bíceps'], is_heavy_day: true, intensity_percentage: 80 },
  { cycle_day: 3, session_name: 'Piernas', muscle_groups: ['Piernas (cuádriceps)'], is_heavy_day: true, intensity_percentage: 80 },
  { cycle_day: 4, session_name: 'Empuje F2', muscle_groups: ['Pecho', 'Tríceps'], is_heavy_day: false, intensity_percentage: 73 },
  { cycle_day: 5, session_name: 'Tirón F2', muscle_groups: ['Espalda', 'Hombro', 'Core'], is_heavy_day: false, intensity_percentage: 73 }
];
test('A-03: freq 3 → 3 sesiones (PPL)', () => {
  expect(resolveCycleSessions(mockSessions, 3).length).toBe(3);
});
test('A-03: freq 4 → 4 sesiones (Torso/Pierna)', () => {
  const c = resolveCycleSessions(mockSessions, 4);
  expect(c.length).toBe(4);
  expect(c[0].session_name.includes('Torso')).toBeTrue();
});
test('A-03: freq 5 → ciclo completo D1-D5', () => {
  expect(resolveCycleSessions(mockSessions, 5).length).toBe(5);
});
test('A-03: sin frecuencia fiable → ciclo completo (5)', () => {
  expect(resolveCycleSessions(mockSessions, null).length).toBe(5);
});

// ============ A-04: balance de menú alineado con totales ============
const T = { protein_g: 40, carbs_g: 50, fat_g: 15 };
test('A-04: proteína cubierta por otra fuente NO bloquea', () => {
  const r = evaluateCandidateMealBalance([
    { role: 'CARBO', macros: { protein_g: 38, carbs_g: 48, fat_g: 2 }, kcal: 380 },
    { role: 'GRASA', macros: { protein_g: 2, carbs_g: 2, fat_g: 14 }, kcal: 150 }
  ], T, 600);
  expect(r.blocksCandidate).toBeFalse();
});
test('A-04: déficit real de proteína SIGUE bloqueando', () => {
  const r = evaluateCandidateMealBalance([
    { role: 'CARBO', macros: { protein_g: 20, carbs_g: 48, fat_g: 2 }, kcal: 300 },
    { role: 'GRASA', macros: { protein_g: 0, carbs_g: 0, fat_g: 14 }, kcal: 150 }
  ], T, 600);
  expect(r.blocksCandidate).toBeTrue();
});
test('A-04: exceso de kcal de verdura SIGUE bloqueando', () => {
  const r = evaluateCandidateMealBalance([
    { role: 'PROTEINA', macros: { protein_g: 40, carbs_g: 5, fat_g: 3 }, kcal: 220 },
    { role: 'CARBO', macros: { protein_g: 5, carbs_g: 50, fat_g: 2 }, kcal: 250 },
    { role: 'GRASA', macros: { protein_g: 1, carbs_g: 1, fat_g: 15 }, kcal: 150 },
    { role: 'VERDURA', macros: { protein_g: 2, carbs_g: 8, fat_g: 1 }, kcal: 200 }
  ], T, 600);
  expect(r.blocksCandidate).toBeTrue();
});

// Reproduce las 12 comidas del recorrido original (3 + 4 + 5) con macros
// globales cubiertos desde roles mixtos. Antes del fix, las 12 caían al fallback
// por exigir que cada macro procediera de su rol canónico.
for (let index = 0; index < 12; index += 1) {
  test(`A-04: comida auditada ${index + 1}/12 no cae en fallback si cubre macros`, () => {
    const target = {
      protein_g: 30 + index,
      carbs_g: 50 + index,
      fat_g: 15 + (index * 0.5)
    };
    const r = evaluateCandidateMealBalance([
      {
        role: 'CARBO',
        macros: {
          protein_g: target.protein_g * 0.92,
          carbs_g: target.carbs_g * 0.6,
          fat_g: 1
        },
        kcal: 300
      },
      {
        role: 'PROTEINA',
        macros: {
          protein_g: target.protein_g * 0.08,
          carbs_g: target.carbs_g * 0.4,
          fat_g: target.fat_g * 0.1
        },
        kcal: 220
      },
      {
        role: 'GRASA',
        macros: { protein_g: 0, carbs_g: 0, fat_g: target.fat_g * 0.9 },
        kcal: 120
      },
      {
        role: 'VERDURA',
        macros: { protein_g: 0, carbs_g: 0, fat_g: 0 },
        kcal: 30
      }
    ], target, 700);
    expect(r.blocksCandidate).toBeFalse();
  });
}

// ============ C-02: sinónimos de lesión ============
const blockedBy = (injuryText, nombre) => isContraindicated({ nombre }, activeInjuryRules(injuryText));
test('C-02: sentadilla búlgara se veta por lesión de rodilla (zancada)', () => {
  expect(blockedBy('Evitar zancadas por dolor de rodilla', 'Sentadilla búlgara con mancuernas')).toBeTrue();
});
test('C-02: crunch con carga se veta por flexión lumbar cargada', () => {
  expect(blockedBy('Evitar flexion lumbar cargada', 'Crunch con carga (disco en pecho)')).toBeTrue();
});
test('C-02: tríceps por encima de la cabeza se veta por hombro', () => {
  expect(blockedBy('Manguito rotador, evitar press por encima de la cabeza', 'Extensión de tríceps por encima de la cabeza en polea')).toBeTrue();
});
test('C-02: no sobre-excluye (plancha con lesión lumbar sigue permitida)', () => {
  expect(blockedBy('Evitar flexion lumbar cargada', 'Plank pesado (con disco en espalda)')).toBeFalse();
});

// Ejecuta los async y cierra
await Promise.all(asyncTests.map((t) => t()));

console.log('\n================================');
console.log(`\n📊 Resultados: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('✨ Todos los tests pasaron!\n');
  process.exit(0);
}
