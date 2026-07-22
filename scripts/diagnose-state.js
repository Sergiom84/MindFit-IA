/**
 * 🔍 Script de Diagnóstico de Estado y Persistencia
 * Verifica el estado completo de la aplicación y detecta problemas
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

// Configuración
const BACKEND_PORT = process.env.PORT || 3002;
const API_BASE = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_PORT = 5173;

// Función para imprimir con color
function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Función para verificar endpoint
async function checkEndpoint(url, method = 'GET', headers = {}) {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
    return {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    };
  } catch (error) {
    return {
      status: 0,
      statusText: error.message,
      ok: false
    };
  }
}

// Función para verificar configuración de archivos
function checkConfiguration() {
  log('\n📋 VERIFICACIÓN DE CONFIGURACIÓN', 'bold');
  log('=====================================', 'cyan');

  // Verificar .env.local
  const envLocalPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envLocal = fs.readFileSync(envLocalPath, 'utf8');
    log('✅ .env.local existe', 'green');
    console.log(envLocal);
  } else {
    log('❌ .env.local NO existe', 'red');
  }

  // Verificar backend/.env
  const backendEnvPath = path.join(__dirname, '../backend/.env');
  if (fs.existsSync(backendEnvPath)) {
    log('✅ backend/.env existe', 'green');
    log(`   Puerto backend: ${BACKEND_PORT}`, 'cyan');
  } else {
    log('❌ backend/.env NO existe', 'red');
  }

  // Verificar vite.config.js
  const viteConfigPath = path.join(__dirname, '../vite.config.js');
  if (fs.existsSync(viteConfigPath)) {
    log('✅ vite.config.js existe', 'green');
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
    if (viteConfig.includes('/api')) {
      log('   ✓ Proxy configurado para /api', 'cyan');
    }
  }
}

// Función principal de diagnóstico
async function diagnoseState() {
  log('\n🔍 DIAGNÓSTICO DE ESTADO Y PERSISTENCIA', 'bold');
  log('=========================================', 'cyan');
  log(`Fecha: ${new Date().toLocaleString()}`, 'yellow');

  // 1. Verificar conectividad básica
  log('\n🌐 VERIFICANDO CONECTIVIDAD', 'bold');
  log('----------------------------', 'cyan');

  const healthCheck = await checkEndpoint(`${API_BASE}/health`);
  if (healthCheck.ok) {
    log(`✅ Backend activo en puerto ${BACKEND_PORT}`, 'green');
  } else {
    log(`❌ Backend NO responde en puerto ${BACKEND_PORT}`, 'red');
    log(`   Error: ${healthCheck.statusText}`, 'yellow');
  }

  // 2. Verificar rutas críticas
  log('\n🛤️ VERIFICANDO RUTAS CRÍTICAS', 'bold');
  log('-------------------------------', 'cyan');

  const criticalRoutes = [
    { path: '/api/methodology/generate', method: 'POST', name: 'Generación de metodología' },
    { path: '/api/calistenia-specialist/evaluate-profile', method: 'POST', name: 'Evaluación Calistenia' },
    { path: '/api/routine-generation/manual/calistenia', method: 'POST', name: 'Calistenia Manual' },
    { path: '/api/training/state', method: 'GET', name: 'Estado de entrenamiento' },
    { path: '/api/routines/active-plan', method: 'GET', name: 'Plan activo' }
  ];

  for (const route of criticalRoutes) {
    const result = await checkEndpoint(`${API_BASE}${route.path}`, route.method);
    const icon = result.status === 404 ? '❌' : result.status === 401 ? '⚠️' : '✅';
    const color = result.status === 404 ? 'red' : result.status === 401 ? 'yellow' : 'green';
    log(`${icon} ${route.name}: ${result.status} ${result.statusText}`, color);
  }

  // 3. Verificar configuración
  checkConfiguration();

  // 4. Verificar problemas comunes
  log('\n🚨 VERIFICANDO PROBLEMAS COMUNES', 'bold');
  log('---------------------------------', 'cyan');

  // Verificar si el puerto está en uso
  const portCheck = await checkEndpoint(`http://localhost:${BACKEND_PORT}/health`);
  if (!portCheck.ok) {
    log('⚠️ Posible problema: Backend no responde', 'yellow');
    log('   Soluciones:', 'cyan');
    log('   1. Ejecutar: cd backend && npm run dev', 'white');
    log('   2. Verificar que el puerto no esté en uso', 'white');
    log('   3. Revisar logs del backend', 'white');
  }

  // Verificar configuración de proxy
  const proxyTest = await checkEndpoint(`http://localhost:${FRONTEND_PORT}/api/health`);
  if (!proxyTest.ok && portCheck.ok) {
    log('⚠️ Posible problema: Proxy de Vite mal configurado', 'yellow');
    log('   Soluciones:', 'cyan');
    log('   1. Reiniciar el frontend: npm run dev', 'white');
    log('   2. Verificar vite.config.js', 'white');
  }

  // 5. Recomendaciones
  log('\n💡 RECOMENDACIONES', 'bold');
  log('------------------', 'cyan');

  if (!healthCheck.ok) {
    log('1. Iniciar el backend:', 'yellow');
    log('   cd backend && npm run dev', 'white');
  }

  log('2. Para sincronizar puertos automáticamente:', 'yellow');
  log('   npm run dev:auto', 'white');

  log('3. Si persisten problemas de estado:', 'yellow');
  log('   - Limpiar localStorage del navegador', 'white');
  log('   - Verificar token de autenticación', 'white');
  log('   - Revisar Network tab en DevTools', 'white');

  // 6. Diagnóstico específico del error 404
  log('\n🔍 DIAGNÓSTICO ERROR 404 EN CALISTENIA', 'bold');
  log('---------------------------------------', 'cyan');

  // Verificar ruta específica de metodología
  const methodologyRoute = await checkEndpoint(`${API_BASE}/api/methodology/generate`, 'POST', {
    'Content-Type': 'application/json'
  });

  if (methodologyRoute.status === 404) {
    log('❌ Ruta /api/methodology/generate devuelve 404', 'red');
    log('   Posibles causas:', 'yellow');
    log('   1. El servidor no tiene esta ruta configurada', 'white');
    log('   2. El middleware de redirección no funciona', 'white');
    log('   3. Falta el router de metodología en server.js', 'white');

    // Verificar si existe el archivo de rutas
    const routePath = path.join(__dirname, '../backend/routes/routineGeneration.js');
    if (fs.existsSync(routePath)) {
      log('   ✓ Archivo routineGeneration.js existe', 'green');
    } else {
      log('   ✗ Archivo routineGeneration.js NO existe', 'red');
    }
  } else if (methodologyRoute.status === 401) {
    log('⚠️ Ruta requiere autenticación', 'yellow');
    log('   El usuario debe estar logueado', 'white');
  } else {
    log(`✅ Ruta responde con estado ${methodologyRoute.status}`, 'green');
  }

  log('\n✨ DIAGNÓSTICO COMPLETADO', 'bold');
  log('=========================\n', 'cyan');
}

// Ejecutar diagnóstico
diagnoseState().catch(error => {
  log(`\n❌ Error durante el diagnóstico: ${error.message}`, 'red');
  process.exit(1);
});