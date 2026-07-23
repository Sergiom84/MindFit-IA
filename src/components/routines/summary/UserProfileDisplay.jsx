import React, { useMemo } from 'react';
import { User, Scale, Ruler, Target, Activity } from 'lucide-react';
import { useProfileState } from '../../../hooks/useProfileState';

/**
 * Display del perfil de usuario en el resumen - MIGRADO A SUPABASE
 * Muestra información del usuario sincronizada con la base de datos
 *
 * MIGRADO: Ahora usa useProfileState que:
 * - Lee localStorage para respuesta inmediata
 * - Fetch automático desde Supabase (/api/users/:id)
 * - Sincronización BD → localStorage automática
 * - Datos completos (40+ campos vs 5 anteriores)
 * - Autenticación JWT para seguridad
 */
export const UserProfileDisplay = () => {
  const { userProfile, calculateIMC, getIMCCategory, getObjetivoLabel } = useProfileState();

  // Procesar datos de perfil de forma segura desde useProfileState
  const profileData = useMemo(() => {
    if (!userProfile) {
      return {
        edad: '—',
        peso: '—',
        altura: '—',
        nivel: '—',
        imc: '—',
        imcCategoria: 'No disponible',
        objetivo: '—'
      };
    }

    // Calcular IMC usando la función del hook
    const imc = calculateIMC(userProfile.peso, userProfile.altura);
    const imcCategoria = getIMCCategory(imc);

    return {
      edad: userProfile.edad ? `${userProfile.edad}` : '—',
      peso: userProfile.peso ? `${Number(userProfile.peso).toFixed(1)} kg` : '—',
      altura: userProfile.altura ? `${userProfile.altura} cm` : '—',
      nivel: userProfile.nivel || '—',
      imc: imc ? `${imc}` : '—',
      imcCategoria: imcCategoria || 'No disponible',
      objetivo: userProfile.objetivo_principal ? getObjetivoLabel(userProfile.objetivo_principal) : '—'
    };
  }, [userProfile, calculateIMC, getIMCCategory, getObjetivoLabel]);

  // Estados de carga - useProfileState carga inmediatamente desde localStorage
  // Si no hay userProfile, significa que no está logueado o no tiene perfil
  if (!userProfile || (userProfile && Object.keys(userProfile).length === 0)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
        <User className="w-3 h-3" />
        <span>Perfil no disponible</span>
      </div>
    );
  }

  const { edad, peso, altura, nivel, imc, imcCategoria, objetivo } = profileData;

  return (
    <div className="mb-3">
      {/* Header del perfil */}
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-medium text-gray-300">Perfil del Usuario</h3>
      </div>

      {/* Fila horizontal compacta con todos los datos */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        {/* Edad */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <Target className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-gray-500">Edad:</span>
          <span className="text-gray-300 font-medium">{edad}</span>
        </div>

        {/* Peso */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <Scale className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-gray-500">Peso:</span>
          <span className="text-gray-300 font-medium">{peso}</span>
        </div>

        {/* Altura */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <Ruler className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-gray-500">Altura:</span>
          <span className="text-gray-300 font-medium">{altura}</span>
        </div>

        {/* IMC */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-gray-500">IMC:</span>
          <span className="text-gray-300 font-medium">
            {imc}
            {imc !== '—' && (
              <span className="text-gray-500 ml-1">({imcCategoria})</span>
            )}
          </span>
        </div>

        {/* Nivel */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <Activity className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-gray-500">Nivel:</span>
          <span className="text-gray-300 font-medium">{nivel}</span>
        </div>

        {/* Objetivo */}
        <div className="flex items-center gap-1.5 text-gray-400">
          <Target className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
          <span className="text-gray-500">Objetivo:</span>
          <span className="text-gray-300 font-medium">{objetivo}</span>
        </div>
      </div>
    </div>
  );
};

export default UserProfileDisplay;