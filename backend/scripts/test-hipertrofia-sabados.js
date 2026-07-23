/**
 * Script de Prueba: Modal de Sábados HipertrofiaV2
 *
 * Valida que el backend genera correctamente el mapeo D1-D5
 * según la configuración de inclusión de sábados
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3010';

// Simular diferentes escenarios de inicio
const testCases = [
  {
    name: '✅ Lunes (No necesita modal)',
    startDate: '2024-11-18', // Lunes
    includeSaturdays: true, // Default
    expectedMapping: {
      D1: 'Lunes',
      D2: 'Martes',
      D3: 'Miércoles',
      D4: 'Jueves',
      D5: 'Viernes'
    }
  },
  {
    name: '✅ Martes CON Sábados',
    startDate: '2024-11-19', // Martes
    includeSaturdays: true,
    expectedMapping: {
      D1: 'Martes',
      D2: 'Miércoles',
      D3: 'Jueves',
      D4: 'Viernes',
      D5: 'Sábado'
    }
  },
  {
    name: '✅ Martes SIN Sábados',
    startDate: '2024-11-19', // Martes
    includeSaturdays: false,
    expectedMapping: {
      D1: 'Martes',
      D2: 'Miércoles',
      D3: 'Jueves',
      D4: 'Viernes',
      D5: 'Lunes'
    }
  },
  {
    name: '✅ Miércoles CON Sábados',
    startDate: '2024-11-20', // Miércoles
    includeSaturdays: true,
    expectedMapping: {
      D1: 'Miércoles',
      D2: 'Jueves',
      D3: 'Viernes',
      D4: 'Sábado',
      D5: 'Lunes'
    }
  },
  {
    name: '✅ Miércoles SIN Sábados',
    startDate: '2024-11-20', // Miércoles
    includeSaturdays: false,
    expectedMapping: {
      D1: 'Miércoles',
      D2: 'Jueves',
      D3: 'Viernes',
      D4: 'Lunes',
      D5: 'Martes'
    }
  },
  {
    name: '✅ Jueves CON Sábados',
    startDate: '2024-11-21', // Jueves
    includeSaturdays: true,
    expectedMapping: {
      D1: 'Jueves',
      D2: 'Viernes',
      D3: 'Sábado',
      D4: 'Lunes',
      D5: 'Martes'
    }
  },
  {
    name: '✅ Jueves SIN Sábados',
    startDate: '2024-11-21', // Jueves
    includeSaturdays: false,
    expectedMapping: {
      D1: 'Jueves',
      D2: 'Viernes',
      D3: 'Lunes',
      D4: 'Martes',
      D5: 'Miércoles'
    }
  },
  {
    name: '✅ Viernes CON Sábados',
    startDate: '2024-11-22', // Viernes
    includeSaturdays: true,
    expectedMapping: {
      D1: 'Viernes',
      D2: 'Sábado',
      D3: 'Lunes',
      D4: 'Martes',
      D5: 'Miércoles'
    }
  },
  {
    name: '✅ Viernes SIN Sábados',
    startDate: '2024-11-22', // Viernes
    includeSaturdays: false,
    expectedMapping: {
      D1: 'Viernes',
      D2: 'Lunes',
      D3: 'Martes',
      D4: 'Miércoles',
      D5: 'Jueves'
    }
  }
];

async function runTests() {
  console.log('\n🧪 TESTS DE MODAL DE SÁBADOS - HIPERTROFIAV2\n');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Fecha: ${testCase.startDate}, includeSaturdays: ${testCase.includeSaturdays}`);

    try {
      // Preparar request body según formato frontend
      const requestBody = {
        nivel: 'Principiante',
        totalWeeks: 8,
        startConfig: {
          startDate: testCase.startDate,
          distributionOption: testCase.includeSaturdays ? 'saturdays' : 'extra_week',
          includeSaturdays: testCase.includeSaturdays
        }
      };

      // Llamar al endpoint (sin token para prueba local)
      const response = await fetch(`${API_URL}/api/hipertrofiav2/generate-d1d5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Backend error: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const actualMapping = data.plan?.d1_d5_mapping || data.d1_d5_mapping;

      // Verificar mapeo
      const isCorrect = JSON.stringify(actualMapping) === JSON.stringify(testCase.expectedMapping);

      if (isCorrect) {
        console.log('   ✅ PASSED - Mapeo correcto');
        console.log('   Mapeo:', actualMapping);
        passed++;
      } else {
        console.log('   ❌ FAILED - Mapeo incorrecto');
        console.log('   Esperado:', testCase.expectedMapping);
        console.log('   Recibido:', actualMapping);
        failed++;
      }

    } catch (error) {
      console.log('   ❌ ERROR:', error.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 RESULTADOS FINALES:`);
  console.log(`   ✅ Passed: ${passed}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failed}/${testCases.length}`);
  console.log(`   📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log(`\n🎉 TODOS LOS TESTS PASARON EXITOSAMENTE\n`);
    process.exit(0);
  } else {
    console.log(`\n⚠️ HAY ${failed} TESTS FALLIDOS\n`);
    process.exit(1);
  }
}

// Ejecutar tests
runTests().catch(error => {
  console.error('❌ Error ejecutando tests:', error);
  process.exit(1);
});
