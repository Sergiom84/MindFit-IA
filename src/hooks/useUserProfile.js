import { useState, useEffect } from 'react';

/**
 * Hook para gestionar el perfil de usuario desde localStorage
 * Maneja parsing, errores y cálculos derivados como IMC
 */
export const useUserProfile = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('userProfile');
      if (stored) {
        const parsed = JSON.parse(stored);

        // Calcular IMC si hay peso y altura
        let imc = null;
        if (parsed.peso && parsed.altura) {
          const alturaMetros = parsed.altura / 100;
          imc = (parsed.peso / (alturaMetros * alturaMetros)).toFixed(1);
        }

        setProfile({
          edad: parsed.edad || null,
          peso: parsed.peso || null,
          altura: parsed.altura || null,
          nivel: parsed.nivel || parsed.nivel_entrenamiento || null,
          imc,
          // Formatters para display
          display: {
            edad: parsed.edad ? `${parsed.edad}` : '—',
            peso: parsed.peso ? `${Number(parsed.peso).toFixed(1)} kg` : '—',
            altura: parsed.altura ? `${parsed.altura} cm` : '—',
            nivel: parsed.nivel || parsed.nivel_entrenamiento || '—',
            imc: imc ? imc : '—'
          }
        });
      } else {
        setProfile(null);
      }
    } catch (err) {
      setError('Error al cargar perfil de usuario');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Función para actualizar perfil
  const updateProfile = (newData) => {
    try {
      const updated = { ...profile, ...newData };
      localStorage.setItem('userProfile', JSON.stringify(updated));
      setProfile(updated);
    } catch (err) {
      setError('Error al guardar perfil');
    }
  };

  // Función para limpiar perfil
  const clearProfile = () => {
    localStorage.removeItem('userProfile');
    setProfile(null);
  };

  return {
    profile,
    loading,
    error,
    updateProfile,
    clearProfile,
    hasProfile: profile !== null
  };
};

export default useUserProfile;