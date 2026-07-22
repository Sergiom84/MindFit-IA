#!/usr/bin/env node
/**
 * 🏥 Monitor de Salud del Sistema
 * Vigila continuamente la conectividad frontend-backend
 */

import { detectBackendPort, updateEnvLocal, testBackendConnectivity } from './check-ports.js';

const MONITOR_INTERVAL = 10000; // 10 segundos
const MAX_FAILURES = 3;

class HealthMonitor {
  constructor() {
    this.failures = 0;
    this.lastKnownPort = null;
    this.isMonitoring = false;
  }

  async start() {
    console.log('🏥 Iniciando Monitor de Salud del Sistema');
    console.log('=====================================');
    this.isMonitoring = true;

    while (this.isMonitoring) {
      try {
        await this.checkHealth();
        await this.sleep(MONITOR_INTERVAL);
      } catch (error) {
        console.error('❌ Error en monitor:', error.message);
        await this.sleep(5000); // Retry más rápido en error
      }
    }
  }

  async checkHealth() {
    const timestamp = new Date().toLocaleTimeString();

    // 1. Detectar puerto actual del backend
    const currentPort = await detectBackendPort();

    // 2. Verificar si el puerto cambió
    if (this.lastKnownPort && this.lastKnownPort !== currentPort) {
      console.log(`🔄 [${timestamp}] Puerto del backend cambió: ${this.lastKnownPort} → ${currentPort}`);
      updateEnvLocal(currentPort);
      console.log('📝 Configuración actualizada automáticamente');
    }

    this.lastKnownPort = currentPort;

    // 3. Verificar conectividad
    const isHealthy = await testBackendConnectivity(currentPort);

    if (isHealthy) {
      if (this.failures > 0) {
        console.log(`✅ [${timestamp}] Sistema recuperado - Backend responde en puerto ${currentPort}`);
      } else {
        console.log(`💚 [${timestamp}] Sistema saludable - Puerto ${currentPort}`);
      }
      this.failures = 0;
    } else {
      this.failures++;
      console.log(`🔴 [${timestamp}] Fallo ${this.failures}/${MAX_FAILURES} - Backend no responde en puerto ${currentPort}`);

      if (this.failures >= MAX_FAILURES) {
        console.log('🚨 ALERTA: Backend no disponible por tiempo prolongado');
        console.log('💡 Acciones recomendadas:');
        console.log('   1. Verificar que el backend esté ejecutándose');
        console.log('   2. Revisar logs del backend para errores');
        console.log('   3. Reiniciar el backend si es necesario');
        console.log('   4. Verificar puerto en backend/.env o server.js');
      }
    }
  }

  stop() {
    console.log('🛑 Deteniendo monitor de salud...');
    this.isMonitoring = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Manejo de señales para cierre limpio
process.on('SIGINT', () => {
  console.log('\n👋 Recibida señal de interrupción');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Recibida señal de terminación');
  process.exit(0);
});

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    (process.argv[1] && process.argv[1].endsWith('health-monitor.js'))) {
  const monitor = new HealthMonitor();

  console.log('💡 Presiona Ctrl+C para detener el monitor\n');
  monitor.start().catch(error => {
    console.error('❌ Error fatal en monitor:', error);
    process.exit(1);
  });
}

export { HealthMonitor };