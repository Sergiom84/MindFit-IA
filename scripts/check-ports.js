#!/usr/bin/env node
/**
 * 🔍 Script de Verificación de Puertos
 * Detecta automáticamente puertos del backend y sincroniza frontend
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PROJECT_ROOT = path.resolve(process.cwd());
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, '.env.local');
const BACKEND_PATH = path.join(PROJECT_ROOT, 'backend');

// 🎯 PUERTO FIJO: 3010 - NO MÁS DETECCIÓN AUTOMÁTICA
async function detectBackendPort() {
  console.log('🔍 Puerto backend FIJO establecido en 3010');

  // REGLA: SIEMPRE usar puerto 3010 para backend
  const FIXED_PORT = 3010;
  console.log(`✅ Puerto backend: ${FIXED_PORT}`);
  return FIXED_PORT;
}

// 🔍 Obtener procesos node activos (multiplataforma)
function getActiveNodeProcesses() {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'wmic' : 'ps';
    const args = isWindows
      ? ['process', 'where', 'name="node.exe"', 'get', 'commandline,processid']
      : ['aux'];

    const proc = spawn(command, args);
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// 🎯 Buscar proceso del backend en la lista
function findBackendProcess(processOutput) {
  const lines = processOutput.split('\n');

  for (const line of lines) {
    // Buscar líneas que contengan server.js y PORT=
    if (line.includes('server.js') && line.includes('PORT=')) {
      const portMatch = line.match(/PORT=(\d+)/);
      if (portMatch) {
        return parseInt(portMatch[1]);
      }
    }

    // Buscar líneas que contengan server.js y el puerto en la línea
    if (line.includes('server.js')) {
      const portMatch = line.match(/:(\d{4})/);
      if (portMatch) {
        return parseInt(portMatch[1]);
      }
    }
  }

  return null;
}

// 📝 Actualizar .env.local con el puerto correcto
function updateEnvLocal(backendPort) {
  console.log(`📝 Actualizando .env.local con puerto ${backendPort}...`);

  let envContent = '';

  if (fs.existsSync(ENV_LOCAL_PATH)) {
    envContent = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
  }

  // Actualizar o añadir variables
  const updates = {
    'VITE_API_PORT': backendPort.toString(),
    'VITE_API_BASE_URL': `http://localhost:${backendPort}`
  };

  Object.entries(updates).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  });

  fs.writeFileSync(ENV_LOCAL_PATH, envContent.trim() + '\n');
  console.log('✅ .env.local actualizado correctamente');
}

// 🌐 Verificar conectividad con el backend
async function testBackendConnectivity(port) {
  console.log(`🌐 Verificando conectividad con localhost:${port}...`);

  return new Promise((resolve) => {
    import('http').then(({ default: http }) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/health',
        method: 'GET',
        timeout: 3000
      }, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Backend responde correctamente');
          resolve(true);
        } else {
          console.warn(`⚠️ Backend responde con status ${res.statusCode}`);
          resolve(false);
        }
      });

      req.on('error', (error) => {
        console.error(`❌ No se puede conectar al backend en puerto ${port}: ${error.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        console.error(`❌ Timeout al conectar con backend en puerto ${port}`);
        req.destroy();
        resolve(false);
      });

      req.end();
    }).catch(() => {
      console.error(`❌ Error al cargar módulo http`);
      resolve(false);
    });
  });
}

// 🎬 Función principal
async function main() {
  console.log('🚀 Verificador de Puertos - Entrena con IA');
  console.log('=====================================\n');

  try {
    // 1. Detectar puerto del backend
    const backendPort = await detectBackendPort();
    console.log(`🎯 Puerto del backend detectado: ${backendPort}\n`);

    // 2. Verificar conectividad
    const isConnected = await testBackendConnectivity(backendPort);

    if (!isConnected) {
      console.log('💡 El backend no responde. Posibles soluciones:');
      console.log('   - Inicia el backend: cd backend && npm run dev');
      console.log(`   - Verifica que esté en puerto ${backendPort}`);
      console.log('   - Revisa los logs del backend\n');
    }

    // 3. Actualizar configuración del frontend
    updateEnvLocal(backendPort);

    // 4. Verificar archivo actual
    console.log('\n📋 Configuración actual en .env.local:');
    if (fs.existsSync(ENV_LOCAL_PATH)) {
      const currentEnv = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
      console.log(currentEnv);
    }

    console.log('\n✅ Verificación completada');
    console.log('💡 Reinicia el frontend para aplicar cambios: npm run dev');

  } catch (error) {
    console.error('❌ Error durante la verificación:', error.message);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

// También ejecutar si es el script principal (para compatibilidad Windows)
if (process.argv[1] && process.argv[1].endsWith('check-ports.js')) {
  main();
}

export { detectBackendPort, updateEnvLocal, testBackendConnectivity };