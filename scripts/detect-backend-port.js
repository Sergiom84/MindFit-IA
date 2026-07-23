#!/usr/bin/env node

/**
 * Script para detectar automáticamente el puerto configurado del backend
 * Lee el archivo .env del backend y extrae el puerto configurado
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BackendPortDetector {
  constructor() {
    this.backendDir = path.join(__dirname, '..', 'backend');
    this.envPath = path.join(this.backendDir, '.env');
    this.packageJsonPath = path.join(this.backendDir, 'package.json');
  }

  /**
   * Lee el puerto desde el archivo .env del backend
   */
  readPortFromEnv() {
    try {
      if (!fs.existsSync(this.envPath)) {
        throw new Error(`No se encontró el archivo .env en: ${this.envPath}`);
      }

      const envContent = fs.readFileSync(this.envPath, 'utf8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('PORT=')) {
          const port = trimmedLine.split('=')[1]?.trim();
          if (port && !isNaN(parseInt(port))) {
            return parseInt(port);
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error leyendo .env del backend:', error.message);
      return null;
    }
  }

  /**
   * Detecta si el backend está corriendo en un puerto específico
   */
  async isPortInUse(port) {
    return new Promise((resolve) => {
      const { createConnection } = require('net');
      const connection = createConnection({ port, host: 'localhost' });

      connection.on('connect', () => {
        connection.end();
        resolve(true);
      });

      connection.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Escanea puertos comunes para encontrar el backend
   */
  async scanCommonPorts() {
    const commonPorts = [3002, 3000, 3001, 3003, 3004, 8000, 8080];
    const activePorts = [];

    for (const port of commonPorts) {
      if (await this.isPortInUse(port)) {
        activePorts.push(port);
      }
    }

    return activePorts;
  }

  /**
   * Verifica si un puerto específico responde como backend API
   */
  async verifyBackendAPI(port) {
    try {
      const fetch = await import('node-fetch').then(m => m.default);

      // Intentar endpoints comunes de API
      const endpoints = ['/api/health', '/health', '/api/status', '/status', '/api', '/'];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`http://localhost:${port}${endpoint}`, {
            method: 'GET',
            timeout: 2000
          });

          if (response.ok) {
            return true;
          }
        } catch (error) {
          // Continuar con el siguiente endpoint
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Método principal para detectar el puerto del backend
   */
  async detectBackendPort() {
    const result = {
      configuredPort: null,
      runningPort: null,
      activePorts: [],
      isRunning: false,
      recommendations: []
    };

    // 1. Leer puerto configurado en .env
    result.configuredPort = this.readPortFromEnv();

    if (result.configuredPort) {
      console.log(`📋 Puerto configurado en .env: ${result.configuredPort}`);

      // Verificar si está corriendo en el puerto configurado
      const isConfiguredPortActive = await this.isPortInUse(result.configuredPort);
      if (isConfiguredPortActive) {
        const isAPI = await this.verifyBackendAPI(result.configuredPort);
        if (isAPI) {
          result.runningPort = result.configuredPort;
          result.isRunning = true;
          console.log(`✅ Backend corriendo en puerto configurado: ${result.configuredPort}`);
        }
      }
    }

    // 2. Escanear puertos activos
    result.activePorts = await this.scanCommonPorts();
    console.log(`🔍 Puertos activos encontrados: ${result.activePorts.join(', ') || 'ninguno'}`);

    // 3. Si no está corriendo en el puerto configurado, buscar en otros puertos
    if (!result.isRunning && result.activePorts.length > 0) {
      for (const port of result.activePorts) {
        if (await this.verifyBackendAPI(port)) {
          result.runningPort = port;
          result.isRunning = true;
          console.log(`⚠️  Backend encontrado en puerto diferente: ${port} (configurado: ${result.configuredPort})`);
          break;
        }
      }
    }

    // 4. Generar recomendaciones
    this.generateRecommendations(result);

    return result;
  }

  /**
   * Genera recomendaciones basadas en el estado detectado
   */
  generateRecommendations(result) {
    if (!result.configuredPort) {
      result.recommendations.push('❌ No se pudo leer el puerto del archivo .env del backend');
      result.recommendations.push('💡 Verificar que existe backend/.env con PORT=xxxx');
    }

    if (!result.isRunning) {
      result.recommendations.push('❌ Backend no está corriendo');
      result.recommendations.push('💡 Ejecutar: npm run dev:backend');
    } else if (result.configuredPort && result.runningPort !== result.configuredPort) {
      result.recommendations.push(`⚠️  Desincronización detectada:`);
      result.recommendations.push(`   - Configurado: ${result.configuredPort}`);
      result.recommendations.push(`   - Corriendo en: ${result.runningPort}`);
      result.recommendations.push('💡 Ejecutar script de sincronización automática');
    } else {
      result.recommendations.push('✅ Configuración de puerto correcta');
    }
  }

  /**
   * Formato de salida para uso en otros scripts
   */
  async getPortInfo() {
    const result = await this.detectBackendPort();

    // Formato para uso en scripts de shell
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else if (process.argv.includes('--port-only')) {
      console.log(result.runningPort || result.configuredPort || '');
    } else {
      // Formato legible para humanos
      console.log('\n📊 Resumen de detección de puertos:');
      console.log('═'.repeat(50));
      result.recommendations.forEach(rec => console.log(rec));
      console.log('═'.repeat(50));

      if (result.runningPort) {
        console.log(`\n🎯 Puerto actual del backend: ${result.runningPort}`);
      }
    }

    return result;
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new BackendPortDetector();
  detector.getPortInfo().catch(console.error);
}

export default BackendPortDetector;