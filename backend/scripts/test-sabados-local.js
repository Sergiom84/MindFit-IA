/**
 * Test Local del Mapeo D1-D5 con/sin Sábados
 * Simula la lógica del backend (líneas 112-153 de hipertrofiaV2.js)
 * sin necesidad de levantar el servidor
 */

console.log('🧪 TEST LOCAL DE MODAL DE SÁBADOS - HIPERTROFIAV2\n');
console.log('='.repeat(80));

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Simula la lógica del backend (líneas 112-153 de hipertrofiaV2.js)
 */
function generateD1D5Mapping(startDate, includeSaturday) {
  // Generar secuencia de días de entrenamiento
  const trainingDays = [];
  let currentDate = new Date(startDate);
  const sessionsNeeded = 40;

  while (trainingDays.length < sessionsNeeded) {
    const dayOfWeek = currentDate.getDay();

    // Determinar si este día es válido para entrenamiento
    const isValidTrainingDay = (() => {
      if (includeSaturday) {
        // Con sábado: Lunes-Sábado
        return dayOfWeek >= 1 && dayOfWeek <= 6;
      } else {
        // Sin sábado: Solo Lunes-Viernes
        return dayOfWeek >= 1 && dayOfWeek <= 5;
      }
    })();

    if (isValidTrainingDay) {
      trainingDays.push({
        date: new Date(currentDate),
        dayName: dayNames[dayOfWeek],
        sessionNumber: trainingDays.length + 1
      });
    }

    // Avanzar al siguiente día
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Crear mapeo D1-D5 basado en los primeros 5 días
  const dynamicDayMapping = {};
  for (let i = 0; i < 5; i++) {
    if (trainingDays[i]) {
      dynamicDayMapping[`D${i + 1}`] = trainingDays[i].dayName;
    }
  }

  return {
    mapping: dynamicDayMapping,
    availableDays: trainingDays.slice(0, 10).map(d => `${d.dayName} (${d.date.toISOString().split('T')[0]})`)
  };
}

/**
 * Tests
 */
const testCases = [
  {
    name: 'Lunes (Default - Con Sábados)',
    startDate: new Date('2024-11-18'), // Lunes
    includeSaturday: true,
    expected: { D1: 'Lunes', D2: 'Martes', D3: 'Miércoles', D4: 'Jueves', D5: 'Viernes' }
  },
  {
    name: 'Martes CON Sábados',
    startDate: new Date('2024-11-19'), // Martes
    includeSaturday: true,
    expected: { D1: 'Martes', D2: 'Miércoles', D3: 'Jueves', D4: 'Viernes', D5: 'Sábado' }
  },
  {
    name: 'Martes SIN Sábados',
    startDate: new Date('2024-11-19'), // Martes
    includeSaturday: false,
    expected: { D1: 'Martes', D2: 'Miércoles', D3: 'Jueves', D4: 'Viernes', D5: 'Lunes' }
  },
  {
    name: 'Miércoles CON Sábados',
    startDate: new Date('2024-11-20'), // Miércoles
    includeSaturday: true,
    expected: { D1: 'Miércoles', D2: 'Jueves', D3: 'Viernes', D4: 'Sábado', D5: 'Lunes' }
  },
  {
    name: 'Miércoles SIN Sábados',
    startDate: new Date('2024-11-20'), // Miércoles
    includeSaturday: false,
    expected: { D1: 'Miércoles', D2: 'Jueves', D3: 'Viernes', D4: 'Lunes', D5: 'Martes' }
  },
  {
    name: 'Jueves CON Sábados',
    startDate: new Date('2024-11-21'), // Jueves
    includeSaturday: true,
    expected: { D1: 'Jueves', D2: 'Viernes', D3: 'Sábado', D4: 'Lunes', D5: 'Martes' }
  },
  {
    name: 'Jueves SIN Sábados',
    startDate: new Date('2024-11-21'), // Jueves
    includeSaturday: false,
    expected: { D1: 'Jueves', D2: 'Viernes', D3: 'Lunes', D4: 'Martes', D5: 'Miércoles' }
  },
  {
    name: 'Viernes CON Sábados',
    startDate: new Date('2024-11-22'), // Viernes
    includeSaturday: true,
    expected: { D1: 'Viernes', D2: 'Sábado', D3: 'Lunes', D4: 'Martes', D5: 'Miércoles' }
  },
  {
    name: 'Viernes SIN Sábados',
    startDate: new Date('2024-11-22'), // Viernes
    includeSaturday: false,
    expected: { D1: 'Viernes', D2: 'Lunes', D3: 'Martes', D4: 'Miércoles', D5: 'Jueves' }
  }
];

let passed = 0;
let failed = 0;

testCases.forEach(testCase => {
  console.log(`\n📋 Test: ${testCase.name}`);
  console.log(`   Fecha: ${testCase.startDate.toISOString().split('T')[0]} (${dayNames[testCase.startDate.getDay()]})`);
  console.log(`   includeSaturday: ${testCase.includeSaturday}`);

  const result = generateD1D5Mapping(testCase.startDate, testCase.includeSaturday);

  console.log(`   Mapeo generado:`, result.mapping);

  // Verificar que el mapeo sea correcto
  const isCorrect = JSON.stringify(result.mapping) === JSON.stringify(testCase.expected);

  if (isCorrect) {
    console.log(`   ✅ PASSED`);
    passed++;
  } else {
    console.log(`   ❌ FAILED`);
    console.log(`   ⚠️  Esperado:`, testCase.expected);
    failed++;
  }

  // Mostrar primeros 5 días de entrenamiento
  console.log(`   Primeros 5 días:`, result.availableDays.slice(0, 5).join(', '));
});

console.log('\n' + '='.repeat(80));
console.log(`\n📊 RESULTADOS FINALES:`);
console.log(`   ✅ Passed: ${passed}/${testCases.length}`);
console.log(`   ❌ Failed: ${failed}/${testCases.length}`);
console.log(`   📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log(`\n🎉 TODOS LOS TESTS PASARON EXITOSAMENTE`);
  console.log(`\n✅ La lógica del mapeo D1-D5 con/sin sábados funciona correctamente\n`);
  process.exit(0);
} else {
  console.log(`\n⚠️ HAY ${failed} TESTS FALLIDOS\n`);
  process.exit(1);
}
