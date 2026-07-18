/**
 * 🔐 useAuthentication - Hook consolidado para Auth + Registration
 *
 * CONSOLIDACIÓN:
 * - Unifica useAuth + useRegistration
 * - API backward-compatible al 100%
 * - Funcionalidad de test/dev preservada
 * - Manejo de errores consistente
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth as useAuthContext } from '../contexts/AuthContext';
import { API_ENDPOINTS } from '../config/api';

// =============================================================================
// 🧪 CONFIGURACIÓN DE TESTING/DEV
// =============================================================================

const TEST_CREDENTIALS = {
  email: 'test@test.com',
  password: 'password'
};

const createTestUser = (userData = {}) => ({
  id: 1,
  nombre: userData.nombre || 'Usuario',
  apellido: userData.apellido || 'Prueba',
  email: userData.email || TEST_CREDENTIALS.email
});

// =============================================================================
// 🔐 HOOK PRINCIPAL CONSOLIDADO
// =============================================================================

export const useAuthentication = () => {
  const navigate = useNavigate();
  const { login: contextLogin } = useAuthContext();

  // Estados consolidados
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegistrationLoading, setIsRegistrationLoading] = useState(false);

  // =============================================================================
  // 🚪 FUNCIÓN DE LOGIN (de useAuth original)
  // =============================================================================

  const login = async (credentials) => {
    setIsLoginLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error de autenticación');
      }

      contextLogin(data.user, data.token, data.refreshToken);
      navigate('/');

      return { success: true };

    } catch (error) {
      console.error('Error en login:', error);

      // Fallback for development - only if backend is unavailable
      if (import.meta.env.DEV &&
          credentials.email === TEST_CREDENTIALS.email &&
          credentials.password === TEST_CREDENTIALS.password) {

        const testUser = createTestUser();
        contextLogin(testUser, 'test-token');
        navigate('/');

        return { success: true };
      }

      return {
        success: false,
        error: error.message.includes('fetch')
          ? 'No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose.'
          : error.message
      };

    } finally {
      setIsLoginLoading(false);
    }
  };

  // =============================================================================
  // 📝 FUNCIÓN DE REGISTRO (de useRegistration original)
  // =============================================================================

  const register = async (userData) => {
    setIsRegistrationLoading(true);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.REGISTER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en el registro');
      }

      // Registro exitoso - login automático si hay token
      if (data.token && data.user) {
        contextLogin(data.user, data.token, data.refreshToken);

        // Limpiar datos guardados del formulario
        localStorage.removeItem('register_form_progress');

        navigate('/');
        return { success: true, autoLogin: true };
      } else {
        // Registro exitoso pero sin auto-login
        localStorage.removeItem('register_form_progress');
        return { success: true, autoLogin: false };
      }

    } catch (error) {
      console.error('Error al registrar usuario:', error);

      // Solo en desarrollo y con datos de prueba específicos
      if (import.meta.env.DEV &&
          userData.email === 'test@test.com') {

        const testUser = createTestUser(userData);
        contextLogin(testUser, 'test-token');
        localStorage.removeItem('register_form_progress');
        navigate('/');

        return { success: true, autoLogin: true };
      }

      return {
        success: false,
        error: error.message.includes('fetch')
          ? 'No se pudo conectar con el servidor. Verifica que el backend esté ejecutándose.'
          : error.message
      };

    } finally {
      setIsRegistrationLoading(false);
    }
  };

  // =============================================================================
  // 📤 API CONSOLIDADA (BACKWARD-COMPATIBLE)
  // =============================================================================

  return {
    // Funciones principales
    login,
    register,

    // Estados de loading
    isLoginLoading,
    isRegistrationLoading,

    // Alias para backward-compatibility
    isLoading: isLoginLoading,        // Para useAuth
    isSubmitting: isRegistrationLoading, // Para useRegistration

    // Estado general
    isAnyLoading: isLoginLoading || isRegistrationLoading
  };
};

// =============================================================================
// 📤 EXPORTS BACKWARD-COMPATIBLE
// =============================================================================

/**
 * Hook de login (API compatible con useAuth original)
 */
export const useAuth = () => {
  const { login, isLoginLoading } = useAuthentication();

  return {
    login,
    isLoading: isLoginLoading
  };
};

/**
 * Hook de registro (API compatible con useRegistration original)
 */
export const useRegistration = () => {
  const { register, isRegistrationLoading } = useAuthentication();

  return {
    register,
    isSubmitting: isRegistrationLoading
  };
};

// Export por defecto del hook consolidado
export default useAuthentication;