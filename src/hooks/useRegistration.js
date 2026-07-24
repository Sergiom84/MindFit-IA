import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth as useAuthContext } from '../contexts/AuthContext';
import { API_ENDPOINTS } from '../config/api';

export const useRegistration = () => {
  const navigate = useNavigate();
  const { login: contextLogin } = useAuthContext();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const register = async (userData) => {
    setIsSubmitting(true);

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

        const testUser = {
          id: 1,
          nombre: userData.nombre || 'Test',
          apellido: userData.apellido || 'User',
          email: userData.email
        };

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
      setIsSubmitting(false);
    }
  };

  return {
    register,
    isSubmitting
  };
};