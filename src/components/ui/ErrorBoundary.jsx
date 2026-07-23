/**
 * 🛡️ Error Boundary - Componente de Protección de Errores
 * 
 * RAZONAMIENTO:
 * - Previene que errores de JavaScript crasheen toda la aplicación
 * - Captura errores en componentes hijos y muestra UI de fallback
 * - Logs de errores para debugging en desarrollo
 * - UI elegante para el usuario en caso de error
 */

import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardHeader } from './card';
import logger from '../../utils/logger';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Actualizar el estado para mostrar la UI de error en el próximo render
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log del error para debugging
    logger.error('Error capturado por ErrorBoundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    }, this.props.context || 'App');

    // Guardar detalles del error en el estado
    this.setState({
      error,
      errorInfo
    });

    // En desarrollo, también mostrar en consola para debugging inmediato
    if (import.meta.env.MODE === 'development') {
      console.error('🛡️ Error Boundary capturó un error:', error);
      console.error('📍 Component Stack:', errorInfo.componentStack);
    }
  }

  handleReload = () => {
    // Recargar la página completa
    window.location.reload();
  };

  handleGoHome = () => {
    // Navegar al home y resetear el estado
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleRetry = () => {
    // Simplemente resetear el estado del error boundary
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Si se proporciona un fallback personalizado, usarlo
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // UI de fallback predeterminada
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-gray-800 border-red-500/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-white">
                {this.props.title || 'Algo salió mal'}
              </h1>
              <p className="text-gray-400 mt-2">
                {this.props.message || 'Se ha producido un error inesperado. Por favor, intenta de nuevo.'}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Botones de recuperación */}
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={this.handleRetry}
                  className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Intentar de nuevo
                </Button>

                <Button 
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="w-full border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Ir al inicio
                </Button>

                <Button 
                  onClick={this.handleReload}
                  variant="ghost"
                  className="w-full text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                  size="sm"
                >
                  Recargar página
                </Button>
              </div>

              {/* Detalles del error en desarrollo */}
              {import.meta.env.MODE === 'development' && this.state.error && (
                <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-mono text-red-400 mb-2">
                    Debug Info (solo desarrollo):
                  </h3>
                  <div className="text-xs font-mono text-gray-500 space-y-1">
                    <div><strong>Error:</strong> {this.state.error.message}</div>
                    <div><strong>Context:</strong> {this.props.context || 'No especificado'}</div>
                    {this.props.showStack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                          Ver stack trace
                        </summary>
                        <pre className="mt-2 text-xs whitespace-pre-wrap text-gray-600">
                          {this.state.error.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Información de contexto si se proporciona */}
              {this.props.context && (
                <div className="text-xs text-gray-500 text-center">
                  Error en: {this.props.context}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // Si no hay error, renderizar los children normalmente
    return this.props.children;
  }
}

export default ErrorBoundary;