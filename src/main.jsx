/**
 * 🚀 main.jsx - Entry Point Principal de MindFit
 *
 * RESPONSABILIDADES:
 * - Punto de entrada de la aplicación React 18
 * - Configuración global de React Router
 * - Error handling a nivel aplicación
 * - Carga de estilos globales
 * - Debugging y logging de desarrollo
 */

// =============================================================================
// 📚 REACT CORE IMPORTS
// =============================================================================
import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';

// =============================================================================
// 🧭 ROUTING
// =============================================================================
import { BrowserRouter } from 'react-router-dom';

// =============================================================================
// 🎨 STYLES & COMPONENTS
// =============================================================================
import './index.css';
import App from './App.jsx';

function installDevApiHostRewrite() {
  if (!import.meta.env.DEV || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const currentHost = window.location.hostname;
  const isLocalBrowser = ['localhost', '127.0.0.1'].includes(currentHost);
  if (isLocalBrowser) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const localApiPrefixes = ['http://localhost:3010', 'http://127.0.0.1:3010'];
  let logged = false;

  window.fetch = (input, init) => {
    const rewrite = (rawUrl) => {
      if (typeof rawUrl !== 'string') {
        return rawUrl;
      }
      for (const prefix of localApiPrefixes) {
        if (rawUrl.startsWith(prefix)) {
          const rewritten = rawUrl.replace(prefix, `http://${currentHost}:3010`);
          if (!logged) {
            console.warn(`[DEV API Rewrite] ${prefix} -> http://${currentHost}:3010`);
            logged = true;
          }
          return rewritten;
        }
      }
      return rawUrl;
    };

    if (typeof input === 'string') {
      return originalFetch(rewrite(input), init);
    }

    if (input instanceof Request) {
      const nextUrl = rewrite(input.url);
      if (nextUrl !== input.url) {
        const nextRequest = new Request(nextUrl, input);
        return originalFetch(nextRequest, init);
      }
    }

    return originalFetch(input, init);
  };
}

// =============================================================================
// 🛡️ GLOBAL ERROR BOUNDARY
// =============================================================================

/**
 * GlobalErrorBoundary - Captura errores no manejados en toda la aplicación
 *
 * BENEFICIOS:
 * - Previene crashes completos de la app
 * - Muestra UI de error amigable al usuario
 * - Logging automático de errores para debugging
 * - Fallback graceful cuando algo sale mal
 */
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    // Actualiza el state para mostrar la UI de error
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log del error para debugging
    console.error('🚨 Global Error Boundary caught an error:', error);
    console.error('📍 Error Info:', errorInfo);

    // Guardar error details en state
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // En production, aquí podrías enviar el error a un servicio de logging
    if (import.meta.env.PROD) {
      // analytics.track('app_error', { error: error.message, stack: error.stack });
    }
  }

  render() {
    if (this.state.hasError) {
      // UI de error personalizada
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl border border-red-400/20 p-8 max-w-md w-full text-center">
            <div className="text-red-400 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-white mb-4">
              ¡Oops! Algo salió mal
            </h1>
            <p className="text-gray-300 mb-6">
              La aplicación encontró un error inesperado. Por favor, recarga la página para continuar.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-yellow-400 hover:bg-yellow-300 text-black font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              🔄 Recargar Aplicación
            </button>

            {/* Debug info - solo en development */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
                  🔍 Detalles del Error (Dev)
                </summary>
                <pre className="mt-4 text-xs text-red-300 bg-gray-900 p-4 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// =============================================================================
// 🚀 APPLICATION INITIALIZATION
// =============================================================================

/**
 * Función de inicialización con logging de desarrollo
 */
function initializeApp() {
  const startTime = performance.now();

  // Logging de inicialización (solo en development)
  if (import.meta.env.DEV) {
    console.log('🚀 MindFit - Inicializando aplicación...');
    console.log('📦 Modo:', import.meta.env.MODE);
    console.log('🌐 Base URL:', import.meta.env.BASE_URL);
    console.log('⚛️ React Version:', React.version);
  }

  // Configurar el root de React 18
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    console.error('❌ Error: No se encontró el elemento #root en el DOM');
    return;
  }

  const root = createRoot(rootElement);

  // Renderizar la aplicación con todas las capas de protección
  root.render(
    <StrictMode>
      <GlobalErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GlobalErrorBoundary>
    </StrictMode>
  );

  // Logging de tiempo de inicialización
  if (import.meta.env.DEV) {
    const endTime = performance.now();
    console.log(`✅ Aplicación inicializada en ${(endTime - startTime).toFixed(2)}ms`);
  }
}

// =============================================================================
// 🎯 BOOTSTRAP DE LA APLICACIÓN
// =============================================================================

installDevApiHostRewrite();

// Inicializar la aplicación
initializeApp();
