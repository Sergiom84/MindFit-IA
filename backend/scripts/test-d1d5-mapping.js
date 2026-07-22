/**
 * Test del mapeo D1-D5 según día de inicio e inclusión de sábados
 * Simula la lógica del backend para verificar el comportamiento actual
 */

function testD1D5Mapping() {
  console.log('🧪 TEST DE MAPEO D1-D5\n');
  console.log('='.repeat(80));

  const testCases = [
    { name: 'Lunes sin sábado', startDate: new Date('2024-11-18'), includeSaturday: false },
    { name: 'Martes CON sábado', startDate: new Date('2024-11-19'), includeSaturday: true },
    { name: 'Martes SIN sábado', startDate: new Date('2024-11-19'), includeSaturday: false },
    { name: 'Miércoles CON sábado', startDate: new Date('2024-11-20'), includeSaturday: true },
    { name: 'Miércoles SIN sábado', startDate: new Date('2024-11-20'), includeSaturday: false },
    { name: 'Jueves CON sábado', startDate: new Date('2024-11-21'), includeSaturday: true },
    { name: 'Jueves SIN sábado', startDate: new Date('2024-11-21'), includeSaturday: false },
  ];

  testCases.forEach(testCase => {
    console.log(`\n📅 Test: ${testCase.name}`);
    console.log(`   Fecha: ${testCase.startDate.toISOString().split('T')[0]} (${getDayName(testCase.startDate.getDay())}), Sábado: ${testCase.includeSaturday ? 'Sí' : 'No'}`);

    const result = generateD1D5Mapping(testCase.startDate, testCase.includeSaturday);

    console.log(`   Días disponibles: ${result.availableDays.join(', ')}`);
    console.log(`   Mapeo:`, result.mapping);

    // Verificar que el mapeo sea correcto
    const expectedMapping = getExpectedMapping(testCase);
    const isCorrect = JSON.stringify(result.mapping) === JSON.stringify(expectedMapping);
    console.log(`   ${isCorrect ? '✅ Mapeo correcto' : '❌ Mapeo INCORRECTO'}`);

    if (!isCorrect) {
      console.log(`   ⚠️ Esperado:`, expectedMapping);
    }
  });

  console.log('\n' + '='.repeat(80));
}

/**
 * Simula la lógica del backend (líneas 112-153 de hipertrofiaV2.js)
 */
function generateD1D5Mapping(startDate, includeSaturday) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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
 * Retorna el mapeo esperado según el caso de prueba
 */
function getExpectedMapping(testCase) {
  const startDay = testCase.startDate.getDay();
  const includeSaturday = testCase.includeSaturday;

  // Lunes (1)
  if (startDay === 1 && !includeSaturday) {
    return { D1: 'Lunes', D2: 'Martes', D3: 'Miércoles', D4: 'Jueves', D5: 'Viernes' };
  }

  // Martes (2)
  if (startDay === 2 && includeSaturday) {
    return { D1: 'Martes', D2: 'Miércoles', D3: 'Jueves', D4: 'Viernes', D5: 'Sábado' };
  }
  if (startDay === 2 && !includeSaturday) {
    return { D1: 'Martes', D2: 'Miércoles', D3: 'Jueves', D4: 'Viernes', D5: 'Lunes' };
  }

  // Miércoles (3)
  if (startDay === 3 && includeSaturday) {
    return { D1: 'Miércoles', D2: 'Jueves', D3: 'Viernes', D4: 'Sábado', D5: 'Lunes' };
  }
  if (startDay === 3 && !includeSaturday) {
    return { D1: 'Miércoles', D2: 'Jueves', D3: 'Viernes', D4: 'Lunes', D5: 'Martes' };
  }

  // Jueves (4)
  if (startDay === 4 && includeSaturday) {
    return { D1: 'Jueves', D2: 'Viernes', D3: 'Sábado', D4: 'Lunes', D5: 'Martes' };
  }
  if (startDay === 4 && !includeSaturday) {
    return { D1: 'Jueves', D2: 'Viernes', D3: 'Lunes', D4: 'Martes', D5: 'Miércoles' };
  }

  return {};
}

function getDayName(dayOfWeek) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dayNames[dayOfWeek];
}

// Ejecutar tests
testD1D5Mapping();
