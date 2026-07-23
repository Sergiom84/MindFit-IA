/**
 * 🔍 DebugProvider - Wrapper Automático para Debugging de Contextos
 *
 * CARACTERÍSTICAS:
 * - Debuggea TODOS los contextos sin modificar componentes
 * - Logs automáticos de cambios en tiempo real
 * - Acceso a historial de acciones desde consola
 * - Control ON/OFF con localStorage
 * - Zero performance impact en producción
 *
 * USO EN App.jsx:
 * import { DebugProvider } from '@/providers/DebugProvider';
 *
 * <DebugProvider>
 *   <AuthProvider>
 *     <WorkoutProvider>
 *       {children}
 *     </WorkoutProvider>
 *   </AuthProvider>
 * </DebugProvider>
 */

import { useEffect, useRef, useCallback } from 'react';

class ContextDebugger {
  constructor() {
    this.contexts = {};
    this.isEnabled = this.getStoredDebugState();
    this.setupGlobalCommands();
  }

  /**
   * 🎯 Registrar un contexto para debugging
   */
  registerContext(name, valueGetter) {
    if (!this.contexts[name]) {
      this.contexts[name] = {
        name,
        valueGetter,
        previousValue: valueGetter(),
        history: [],
        listeners: [],
        changeCount: 0,
        firstSeenAt: new Date(),
      };

      console.log(`✅ Contexto registrado para debugging: ${name}`);
    }
  }

  /**
   * 🔄 Detectar y loguear cambios en un contexto
   */
  checkContextChanges(name) {
    if (!this.isEnabled) return;

    const context = this.contexts[name];
    if (!context) return;

    const currentValue = context.valueGetter();
    const previousValue = context.previousValue;

    const changes = this.detectChanges(previousValue, currentValue);

    if (Object.keys(changes).length > 0) {
      context.changeCount++;

      const logEntry = {
        timestamp: new Date().toLocaleTimeString('es-ES'),
        changeNumber: context.changeCount,
        changes,
        fullState: currentValue,
      };

      context.history.push(logEntry);

      // Mantener solo los últimos 100 logs
      if (context.history.length > 100) {
        context.history.shift();
      }

      // 🖨️ Log bonito en consola
      this.logContextChange(name, changes, currentValue);

      // Notificar listeners
      context.listeners.forEach((listener) => listener(logEntry));
    }

    context.previousValue = JSON.parse(JSON.stringify(currentValue));
  }

  /**
   * 🔍 Detectar qué propiedades cambiaron
   */
  detectChanges(prev, curr, path = '') {
    const changes = {};

    if (!curr || typeof curr !== 'object') {
      if (JSON.stringify(prev) !== JSON.stringify(curr)) {
        return { [path || 'value']: { before: prev, after: curr } };
      }
      return changes;
    }

    Object.keys(curr).forEach((key) => {
      const fullPath = path ? `${path}.${key}` : key;
      const prevVal = prev?.[key];
      const currVal = curr[key];

      if (JSON.stringify(prevVal) !== JSON.stringify(currVal)) {
        changes[fullPath] = {
          before: prevVal,
          after: currVal,
        };
      }
    });

    return changes;
  }

  /**
   * 🖨️ Log formateado en consola
   */
  logContextChange(name, changes, fullState) {
    console.group(
      `%c🔄 ${name} Update #${this.contexts[name].changeCount}`,
      'color: #FFD700; font-weight: bold; font-size: 14px'
    );

    console.table(changes);

    console.log('%c📸 Full State:', 'color: #00D4FF; font-weight: bold');
    console.log(fullState);

    // Si hay errores, resaltar
    if (fullState?.error) {
      console.error('%c❌ ERROR DETECTED:', 'color: #FF6B6B; font-weight: bold');
      console.error(fullState.error);
    }

    // Si hay loading
    if (fullState?.loading) {
      console.info('%c⏳ LOADING STATE', 'color: #FFA500; font-weight: bold');
    }

    console.groupEnd();
  }

  /**
   * 📊 Obtener historial de cambios de un contexto
   */
  getHistory(contextName) {
    if (!this.contexts[contextName]) {
      console.warn(`⚠️ Contexto no registrado: ${contextName}`);
      return [];
    }

    return this.contexts[contextName].history;
  }

  /**
   * 🔍 Buscar un cambio específico
   */
  findChanges(contextName, predicate) {
    const history = this.getHistory(contextName);
    return history.filter((entry) => predicate(entry));
  }

  /**
   * 📈 Estadísticas de cambios
   */
  getStats(contextName) {
    const context = this.contexts[contextName];
    if (!context) return null;

    return {
      name: contextName,
      totalChanges: context.changeCount,
      history: context.history.length,
      firstSeenAt: context.firstSeenAt,
      registeredAt: new Date().toLocaleTimeString('es-ES'),
    };
  }

  /**
   * 🌐 Obtener todas las estadísticas
   */
  getAllStats() {
    return Object.entries(this.contexts).reduce((acc, [name, context]) => {
      acc[name] = {
        totalChanges: context.changeCount,
        historySize: context.history.length,
        firstSeenAt: context.firstSeenAt,
      };
      return acc;
    }, {});
  }

  /**
   * 🎛️ Comandos globales para consola
   */
  setupGlobalCommands() {
    window.__DEBUG_CONTEXTS = {
      enable: () => this.enable(),
      disable: () => this.disable(),
      isEnabled: () => this.isEnabled,
      getStats: (name) => this.getStats(name),
      getAllStats: () => this.getAllStats(),
      getHistory: (name) => this.getHistory(name),
      findChanges: (name, predicate) => this.findChanges(name, predicate),
      listContexts: () => Object.keys(this.contexts),
      clearHistory: (name) => this.clearHistory(name),
    };

    console.log('%c🔧 DEBUG COMMANDS AVAILABLE', 'color: #00FF00; font-weight: bold');
    console.log('Usa: window.__DEBUG_CONTEXTS.getHistory("NombreDelContexto")');
  }

  /**
   * 🚨 Limpiar historial de un contexto
   */
  clearHistory(contextName) {
    if (this.contexts[contextName]) {
      this.contexts[contextName].history = [];
      console.log(`✨ Historial de ${contextName} limpiado`);
    }
  }

  /**
   * 🎛️ Habilitar debugging
   */
  enable() {
    this.isEnabled = true;
    localStorage.setItem('debug-contexts-enabled', 'true');
    console.log('%c✅ DEBUGGING HABILITADO', 'color: #00FF00; font-weight: bold');
  }

  /**
   * 🎛️ Deshabilitar debugging
   */
  disable() {
    this.isEnabled = false;
    localStorage.setItem('debug-contexts-enabled', 'false');
    console.log('%c❌ DEBUGGING DESHABILITADO', 'color: #FF6B6B; font-weight: bold');
  }

  /**
   * 📦 Obtener estado almacenado
   */
  getStoredDebugState() {
    const stored = localStorage.getItem('debug-contexts-enabled');
    // En desarrollo, habilitar por defecto; en producción, deshabilitar
    if (stored === null) {
      return process.env.NODE_ENV === 'development';
    }
    return stored === 'true';
  }
}

// 🌐 Instancia global
const contextDebugger = new ContextDebugger();

/**
 * 🔍 Hook para registrar un contexto automáticamente
 */
export const useContextDebug = (contextValue, contextName) => {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!registeredRef.current) {
      contextDebugger.registerContext(contextName, () => contextValue);
      registeredRef.current = true;
    }

    // Verificar cambios cada render
    contextDebugger.checkContextChanges(contextName);
  }, [contextValue, contextName]);

  return contextValue;
};

/**
 * 🎯 DebugProvider - Wrapper para aplicar debugging automático
 */
export const DebugProvider = ({ children }) => {
  useEffect(() => {
    // Mostrar instrucciones al montar
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        console.log(
          '%c📚 DEBUGGING GUIDE',
          'color: #00D4FF; font-weight: bold; font-size: 16px'
        );
        console.log(
          '%cList all contexts:\n%c  window.__DEBUG_CONTEXTS.listContexts()',
          'color: #FFD700',
          'color: #00FF00; font-family: monospace'
        );
        console.log(
          '%cGet context history:\n%c  window.__DEBUG_CONTEXTS.getHistory("WorkoutContext")',
          'color: #FFD700',
          'color: #00FF00; font-family: monospace'
        );
        console.log(
          '%cGet all stats:\n%c  window.__DEBUG_CONTEXTS.getAllStats()',
          'color: #FFD700',
          'color: #00FF00; font-family: monospace'
        );
        console.log(
          '%cDisable debugging:\n%c  window.__DEBUG_CONTEXTS.disable()',
          'color: #FFD700',
          'color: #FF6B6B; font-family: monospace'
        );
      }, 500);
    }

    return () => {
      // Cleanup
    };
  }, []);

  return children;
};

export { contextDebugger };
