import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth as useAuthContext } from '../contexts/AuthContext';
import { API_ENDPOINTS } from '../config/api';

const TEST_CREDENTIALS = {
  email: 'test@test.com',
  password: 'password'
};

const createTestUser = () => ({
  id: 1,
  nombre: 'Usuario',
  apellido: 'Prueba',
  email: TEST_CREDENTIALS.email
});

export const useAuth = () => {
  const navigate = useNavigate();
  const { login: contextLogin } = useAuthContext();
  const [isLoading, setIsLoading] = useState(false);

  const login = async (credentials) => {
    setIsLoading(true);

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
      setIsLoading(false);
    }
  };

  return {
    login,
    isLoading
  };
};