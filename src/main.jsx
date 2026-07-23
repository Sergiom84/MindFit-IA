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
/* global __APP_VERSION__ */

// =============================================================================
// 📚 REACT CORE IMPORTS
// =============================================================================
import React, { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { initWebVitals } from './utils/webVitals';
import { getApiBaseUrl } from './config/api';

// =============================================================================
// 🧭 ROUTING
// =============================================================================
import { BrowserRouter } from 'react-router-dom';

// =============================================================================
// 🎨 STYLES & COMPONENTS
// =============================================================================
import './index.css';
import App from './App.jsx';

// =============================================================================
// 🛰️ SENTRY - inicializar lo antes posible para capturar fallos de arranque
// (pantalla en blanco al abrir el APK, errores antes de montar React, etc.)
// El DSN es una clave pública (no un secreto) diseñada para ir en el bundle cliente.
// =============================================================================
const SENTRY_DSN = 'https://ad6f5d8d11153a5e013a7bf9e3ddb219@o4511752258584576.ingest.de.sentry.io/4511752266580048';

if (!import.meta.env.DEV) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `entrenaconia@${__APP_VERSION__ || 'dev'}`,
    tracesSampleRate: 0.2,
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    Sentry.captureException(event.error || new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(event.reason || new Error('Unhandled promise rejection'));
  });
}

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

/**
 * Normaliza las llamadas `fetch('/api/...')` root-relativas a URL absoluta contra
 * la base de API canónica (getApiBaseUrl()).
 *
 * MOTIVO: en la app Capacitor el origen es `https://localhost`, así que un
 * `/api/...` relativo resuelve al bundle local y devuelve el index.html de la
 * SPA (JSON.parse peta). En web es inofensivo: getApiBaseUrl() es el mismo
 * origen, así que la URL resultante es idéntica a la que ya se resolvía.
 */
function installRelativeApiRewrite() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const toAbsolute = (rawUrl) => {
    if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/api/')) {
      return rawUrl;
    }
    const base = getApiBaseUrl();
    return `${base}${rawUrl}`;
  };

  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      return originalFetch(toAbsolute(input), init);
    }

    if (input instanceof Request) {
      // Request.url ya es absoluta (resuelta contra el origen). Si es
      // <origen>/api/... la reescribimos a la base de API canónica.
      try {
        const parsed = new URL(input.url);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')) {
          const nextUrl = `${getApiBaseUrl()}${parsed.pathname}${parsed.search}`;
          return originalFetch(new Request(nextUrl, input), init);
        }
      } catch {
        // URL no parseable: delegar sin tocar
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

    Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
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

  // PERF-001: instrumentación de Web Vitals (LCP/INP/CLS/FCP/TTFB).
  initWebVitals();

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
installRelativeApiRewrite();

// Inicializar la aplicación
initializeApp();
