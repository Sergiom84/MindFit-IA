/*
 * ⚠️ ARCHIVO TEMPORALMENTE DESHABILITADO ⚠️
 *
 * Este modal ha sido reemplazado por modales específicos por metodología:
 * - CalisteniaManualCard.jsx
 * - HeavyDutyManualCard.jsx
 * - HipertrofiaManualCard.jsx
 *
 * El flujo actual va directo a cada modal específico sin pasar por selección de versión.
 * Se mantiene este archivo comentado para futuras referencias o posible restauración.
 *
 * Fecha de deshabilitación: 2025-10-06
 */

/*
/**
 * MethodologyVersionSelectionModal - Arquitectura Modular Profesional v3.0
 * Advanced modal for methodology version selection with intelligent recommendations
 * Refactored with centralized configuration, useReducer pattern, and modular components
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 3.0.0 - Centralized Config & Component Composition
 */

/*
import React, { useEffect, useMemo, useReducer } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Lock, Unlock, AlertTriangle, CheckCircle, Brain, Target, Shield, Zap, Calendar } from 'lucide-react';

import { useTrace } from '@/contexts/TraceContext.jsx';

// Configuraciones centralizadas
const VERSION_SELECTION_CONFIG = {
  THEME: {
    PRIMARY: 'yellow-400',
    SUCCESS: 'green-400',
    WARNING: 'amber-400',
    DANGER: 'red-400',
    INFO: 'blue-400',
    BACKGROUND: {
      MODAL: 'gray-900',
      CARD: 'gray-800',
      CARD_HOVER: 'gray-700/30',
      WARNING: 'red-900/30',
      INFO: 'gray-700/50'
    },
    BORDER: {
      DEFAULT: 'gray-700',
      PRIMARY: 'yellow-500/50',
      SUCCESS: 'green-500/50',
      WARNING: 'amber-700',
      DANGER: 'red-700',
      DIVIDER: 'gray-600'
    },
    TEXT: {
      PRIMARY: 'white',
      SECONDARY: 'gray-300',
      MUTED: 'gray-400',
      SUCCESS: 'green-400',
      WARNING: 'amber-200',
      DANGER: 'red-400',
      INFO: 'blue-300'
    }
  },
  LIMITS: {
    MIN_WEEKS: 1,
    MAX_WEEKS: 7,
    DEFAULT_WEEKS: 4
  },
  USER_LEVELS: {
    BEGINNER: 'principiante',
    INTERMEDIATE: 'intermedio',
    ADVANCED: 'avanzado'
  },
  VERSIONS: {
    ADAPTED: 'adapted',
    STRICT: 'strict'
  },
  MODES: {
    AUTOMATIC: 'automatic',
    MANUAL: 'manual'
  }
};

// Utilidades de validación y helpers
const VersionSelectionUtils = {
  validateUserProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      console.warn('[MethodologyVersionSelectionModal] Invalid user profile provided');
      return false;
    }
    return true;
  },

  normalizeProfile(userProfile) {
    if (!userProfile) return {};
    return userProfile.user || userProfile;
  },

  extractTrainingYears(profile) {
    const normalized = this.normalizeProfile(profile);

    return normalized.años_entrenando ||
           normalized.anos_entrenando ||
           normalized.years_training ||
           normalized.experiencia_anos ||
           profile.años_entrenando ||
           profile.anos_entrenando ||
           0;
  },

  extractCurrentLevel(profile) {
    const normalized = this.normalizeProfile(profile);

    return normalized.nivel_entrenamiento ||
           normalized.nivel_actual_entreno ||
           normalized.nivel_ent ||
           normalized.training_userLevel ||
           profile.nivel_entrenamiento ||
           profile.nivel_actual_entreno ||
           VERSION_SELECTION_CONFIG.USER_LEVELS.BEGINNER;
  },

  calculateUserLevel(userProfile) {
    if (!userProfile) return VERSION_SELECTION_CONFIG.USER_LEVELS.BEGINNER;

    const yearsTraining = this.extractTrainingYears(userProfile);
    const currentLevel = this.extractCurrentLevel(userProfile);

    if (yearsTraining >= 5 || currentLevel === 'avanzado' || currentLevel === 'competicion') {
      return VERSION_SELECTION_CONFIG.USER_LEVELS.ADVANCED;
    }
    if (yearsTraining >= 2 || currentLevel === 'intermedio') {
      return VERSION_SELECTION_CONFIG.USER_LEVELS.INTERMEDIATE;
    }
    return VERSION_SELECTION_CONFIG.USER_LEVELS.BEGINNER;
  },

  getAutoRecommendation(userLevel) {
    return userLevel === VERSION_SELECTION_CONFIG.USER_LEVELS.BEGINNER
      ? VERSION_SELECTION_CONFIG.VERSIONS.ADAPTED
      : VERSION_SELECTION_CONFIG.VERSIONS.STRICT;
  },

  isInappropriateSelection(userLevel, selectedVersion) {
    return userLevel === VERSION_SELECTION_CONFIG.USER_LEVELS.BEGINNER &&
           selectedVersion === VERSION_SELECTION_CONFIG.VERSIONS.STRICT;
  },

  sanitizeWeeksValue(value) {
    const { MIN_WEEKS, MAX_WEEKS, DEFAULT_WEEKS } = VERSION_SELECTION_CONFIG.LIMITS;
    const parsed = parseInt(value);
    if (isNaN(parsed)) return DEFAULT_WEEKS;
    return Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, parsed));
  }
};

// Reducer para manejar estado complejo
const versionSelectionReducer = (state, action) => {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, selectionMode: action.payload };
    case 'SET_VERSION':
      return { ...state, selectedVersion: action.payload };
    case 'SET_WEEKS':
      return { ...state, customWeeks: VersionSelectionUtils.sanitizeWeeksValue(action.payload) };
    case 'UPDATE_WARNINGS':
      return {
        ...state,
        showWarning: action.payload.showWarning,
        requiresConfirmation: action.payload.requiresConfirmation
      };
    case 'CLEAR_CONFIRMATION':
      return { ...state, requiresConfirmation: false };
    case 'RESET_TO_AUTO':
      return {
        ...state,
        selectedVersion: action.payload.recommendation,
        showWarning: false,
        requiresConfirmation: false
      };
    default:
      return state;
  }
};

export default function MethodologyVersionSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  userProfile,
  isAutomatic = false,
  selectedMethodology = null
}) {
  // Estado usando useReducer para mejor manejo de estados complejos
  const [state, dispatch] = useReducer(versionSelectionReducer, {
    selectionMode: VERSION_SELECTION_CONFIG.MODES.AUTOMATIC,
    selectedVersion: VERSION_SELECTION_CONFIG.VERSIONS.ADAPTED,
    showWarning: false,
    requiresConfirmation: false,
    customWeeks: VERSION_SELECTION_CONFIG.LIMITS.DEFAULT_WEEKS
  });

  const { track } = useTrace();
  const prevOpenRef = React.useRef(isOpen);
  React.useEffect(() => {
    if (prevOpenRef.current !== isOpen) {
      track(isOpen ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'MethodologyVersionSelectionModal' }, { component: 'MethodologyVersionSelectionModal' });
      prevOpenRef.current = isOpen;
    }
  }, [isOpen]);

  // Validar props de entrada
  if (!VersionSelectionUtils.validateUserProfile(userProfile)) {
    console.warn('[MethodologyVersionSelectionModal] Invalid user profile provided');
  }

  // Calcular nivel de usuario usando utilidad centralizada
  const userLevel = useMemo(() => {
    return VersionSelectionUtils.calculateUserLevel(userProfile);
  }, [userProfile]);

  // Obtener años de entrenamiento usando utilidad centralizada
  const trainingYears = useMemo(() => {
    return VersionSelectionUtils.extractTrainingYears(userProfile);
  }, [userProfile]);

  // Obtener nivel declarado usando utilidad centralizada
  const declaredLevel = useMemo(() => {
    return VersionSelectionUtils.extractCurrentLevel(userProfile);
  }, [userProfile]);

  // Obtener recomendación automática usando utilidad centralizada
  const autoRecommendation = useMemo(() => {
    return VersionSelectionUtils.getAutoRecommendation(userLevel);
  }, [userLevel]);

  // Effect para manejar cambios de modo y versión
  useEffect(() => {
    const { selectionMode, selectedVersion } = state;

    if (selectionMode === VERSION_SELECTION_CONFIG.MODES.AUTOMATIC) {
      dispatch({
        type: 'RESET_TO_AUTO',
        payload: { recommendation: autoRecommendation }
      });
    } else {
      const isInappropriate = VersionSelectionUtils.isInappropriateSelection(userLevel, selectedVersion);
      dispatch({
        type: 'UPDATE_WARNINGS',
        payload: {
          showWarning: isInappropriate,
          requiresConfirmation: isInappropriate
        }
      });
    }
  }, [state.selectionMode, state.selectedVersion, userLevel, autoRecommendation]);

  // Handlers para acciones del usuario
  const handleModeChange = (mode) => {
    track('MODE_SELECT', { mode }, { component: 'MethodologyVersionSelectionModal' });
    dispatch({ type: 'SET_MODE', payload: mode });
  };

  const handleVersionChange = (version) => {
    track('VERSION_SELECT', { version }, { component: 'MethodologyVersionSelectionModal' });
    dispatch({ type: 'SET_VERSION', payload: version });
  };

  const handleWeeksChange = (weeks) => {
    const sanitized = VersionSelectionUtils.sanitizeWeeksValue(weeks);
    track('INPUT_CHANGE', { id: 'weeks', value: sanitized }, { component: 'MethodologyVersionSelectionModal' });
    dispatch({ type: 'SET_WEEKS', payload: sanitized });
  };

  const handleConfirmRisk = () => {
    track('BUTTON_CLICK', { id: 'confirm_risk' }, { component: 'MethodologyVersionSelectionModal' });
    dispatch({ type: 'CLEAR_CONFIRMATION' });
  };

  const handleConfirm = () => {
    track('BUTTON_CLICK', {
      id: 'generate',
      selectionMode: state.selectionMode,
      version: state.selectedVersion,
      customWeeks: state.customWeeks,
      isRecommended: state.selectedVersion === autoRecommendation
    }, { component: 'MethodologyVersionSelectionModal' });
    onConfirm({
      selectionMode: state.selectionMode,
      version: state.selectedVersion,
      userLevel: userLevel,
      isRecommended: state.selectedVersion === autoRecommendation,
      customWeeks: state.customWeeks
    });
  };


  // Componentes modulares internos
  const UserProfileSection = () => (
    <div className={`bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} p-4 rounded-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <Brain className={`h-5 w-5 text-${VERSION_SELECTION_CONFIG.THEME.INFO}`} />
        <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-medium`}>
          Tu Perfil de Entrenamiento
        </span>
      </div>
      <div className={`text-sm text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} space-y-1`}>
        <p>
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED}`}>Nivel:</span>{' '}
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} capitalize`}>
            {userLevel}
          </span>
        </p>
        <p>
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED}`}>Años entrenando:</span>{' '}
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY}`}>
            {trainingYears} años
          </span>
        </p>
        <p>
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED}`}>Nivel declarado:</span>{' '}
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.INFO} capitalize`}>
            {declaredLevel}
          </span>
        </p>
        {selectedMethodology && (
          <p>
            <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED}`}>Metodología:</span>{' '}
            <span className={`text-${VERSION_SELECTION_CONFIG.THEME.PRIMARY}`}>
              {selectedMethodology}
            </span>
          </p>
        )}
        <div className={`mt-3 pt-2 border-t border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT}`}>
          <p className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.INFO}`}>
            Basándome en tu perfil ({userLevel}, {trainingYears} años de experiencia),
            recomiendo la <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-medium`}>
              versión {autoRecommendation === VERSION_SELECTION_CONFIG.VERSIONS.ADAPTED ? 'adaptada' : 'estricta'}
            </span> durante <span className="text-purple-400 font-medium">{state.customWeeks} semanas</span>.
          </p>
        </div>
      </div>
    </div>
  );

  const ModeSelectionSection = () => (
    <div>
      <h3 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-6`}>
        Selecciona cómo quieres proceder:
      </h3>
      <RadioGroup value={state.selectionMode} onValueChange={handleModeChange}>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-4">
            <RadioGroupItem value={VERSION_SELECTION_CONFIG.MODES.AUTOMATIC} id="automatic" className="mt-2" />
            <Label htmlFor="automatic" className="flex-1">
              <Card className={`p-6 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT} hover:border-${VERSION_SELECTION_CONFIG.THEME.BORDER.PRIMARY} transition-colors cursor-pointer h-full`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 bg-${VERSION_SELECTION_CONFIG.THEME.PRIMARY}/20 rounded-lg`}>
                    <Lock className={`h-6 w-6 text-${VERSION_SELECTION_CONFIG.THEME.PRIMARY}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-3`}>
                      🔒 Selección Automática (Recomendado)
                    </h4>
                    <p className={`text-base text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} mb-4 leading-relaxed`}>
                      La IA asigna automáticamente la versión más apropiada según tu nivel y experiencia.
                    </p>
                    <div className="flex items-center gap-2">
                      <CheckCircle className={`h-5 w-5 text-${VERSION_SELECTION_CONFIG.THEME.SUCCESS}`} />
                      <span className={`text-base text-${VERSION_SELECTION_CONFIG.THEME.SUCCESS}`}>
                        Recomendado para la mayoría de usuarios
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Label>
          </div>

          <div className="flex items-start space-x-4">
            <RadioGroupItem value={VERSION_SELECTION_CONFIG.MODES.MANUAL} id="manual" className="mt-2" />
            <Label htmlFor="manual" className="flex-1">
              <Card className={`p-6 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT} hover:border-blue-500/50 transition-colors cursor-pointer h-full`}>
                <div className="flex items-start gap-4">
                  <div className={`p-3 bg-${VERSION_SELECTION_CONFIG.THEME.INFO}/20 rounded-lg`}>
                    <Unlock className={`h-6 w-6 text-${VERSION_SELECTION_CONFIG.THEME.INFO}`} />
                  </div>
                  <div className="flex-1">
                    <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-3`}>
                      🔓 Selección Manual
                    </h4>
                    <p className={`text-base text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} mb-4 leading-relaxed`}>
                      Tú eliges manualmente entre versión adaptada o estricta.
                    </p>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`h-5 w-5 text-${VERSION_SELECTION_CONFIG.THEME.WARNING}`} />
                      <span className={`text-base text-${VERSION_SELECTION_CONFIG.THEME.WARNING}`}>
                        Requiere experiencia en la metodología
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Label>
          </div>
        </div>
      </RadioGroup>
    </div>
  );

  const VersionSelectionSection = () => (
    state.selectionMode === VERSION_SELECTION_CONFIG.MODES.MANUAL && (
      <div>
        <h3 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-6`}>
          Selecciona la versión:
        </h3>
        <RadioGroup value={state.selectedVersion} onValueChange={handleVersionChange}>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-4">
              <RadioGroupItem value={VERSION_SELECTION_CONFIG.VERSIONS.ADAPTED} id="adapted" className="mt-2" />
              <Label htmlFor="adapted" className="flex-1">
                <Card className={`p-6 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT} hover:border-${VERSION_SELECTION_CONFIG.THEME.BORDER.SUCCESS} transition-colors cursor-pointer h-full`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 bg-${VERSION_SELECTION_CONFIG.THEME.SUCCESS}/20 rounded-lg`}>
                      <Shield className={`h-6 w-6 text-${VERSION_SELECTION_CONFIG.THEME.SUCCESS}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-4`}>
                        Versión Adaptada
                      </h4>
                      <div className={`space-y-3 text-base text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY}`}>
                        <p>• Intensidad inicial moderada</p>
                        <p>• Volumen bajo a medio</p>
                        <p>• Descanso personalizado</p>
                        <p>• Bajo riesgo de sobreentrenamiento</p>
                        <p>• Adaptable y progresiva</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </Label>
            </div>

            <div className="flex items-start space-x-4">
              <RadioGroupItem value={VERSION_SELECTION_CONFIG.VERSIONS.STRICT} id="strict" className="mt-2" />
              <Label htmlFor="strict" className="flex-1">
                <Card className={`p-6 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT} hover:border-red-500/50 transition-colors cursor-pointer h-full`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 bg-${VERSION_SELECTION_CONFIG.THEME.DANGER}/20 rounded-lg`}>
                      <Zap className={`h-6 w-6 text-${VERSION_SELECTION_CONFIG.THEME.DANGER}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-4`}>
                        Versión Estricta
                      </h4>
                      <div className={`space-y-3 text-base text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY}`}>
                        <p>• Intensidad inicial alta</p>
                        <p>• Volumen medio a alto</p>
                        <p>• Descanso estándar</p>
                        <p>• Mayor frecuencia por grupo muscular</p>
                        <p>• Riesgo alto si no se regula</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </Label>
            </div>
          </div>
        </RadioGroup>
      </div>
    )
  );

  const DurationSelectorSection = () => (
    <div className={`bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} p-6 rounded-lg`}>
      <div className="flex items-center gap-3 mb-4">
        <Calendar className="h-6 w-6 text-purple-400" />
        <h3 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg`}>
          Duración del Plan
        </h3>
      </div>
      <p className={`text-base text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} mb-6 leading-relaxed`}>
        La IA se encarga de prepararte el entrenamiento, pero si prefieres modificar las semanas, házlo aquí:
      </p>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Label htmlFor="weeks" className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} text-base font-medium`}>
          Número de semanas:
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="weeks"
            type="number"
            min={VERSION_SELECTION_CONFIG.LIMITS.MIN_WEEKS}
            max={VERSION_SELECTION_CONFIG.LIMITS.MAX_WEEKS}
            value={state.customWeeks}
            onChange={(e) => handleWeeksChange(e.target.value)}
            className={`w-24 h-12 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} border-gray-600 text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} text-center text-lg font-semibold`}
          />
          <span className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED} text-base`}>
            semanas ({VERSION_SELECTION_CONFIG.LIMITS.MIN_WEEKS}-{VERSION_SELECTION_CONFIG.LIMITS.MAX_WEEKS})
          </span>
        </div>
      </div>
      <div className={`mt-4 text-sm text-${VERSION_SELECTION_CONFIG.THEME.TEXT.MUTED} bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.INFO} p-3 rounded-lg`}>
        💡 <strong>Recomendación:</strong> 4-5 semanas para principiantes, 5-6 para intermedios, 6-7 para avanzados
      </div>
    </div>
  );

  const WarningSection = () => (
    state.showWarning && (
      <Alert className={`border-${VERSION_SELECTION_CONFIG.THEME.BORDER.WARNING} bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.WARNING}`}>
        <AlertTriangle className={`h-4 w-4 text-${VERSION_SELECTION_CONFIG.THEME.WARNING}`} />
        <AlertDescription className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.WARNING}`}>
          <strong>Advertencia:</strong> Has seleccionado la versión estricta siendo principiante.
          Esto puede resultar en sobreentrenamiento, lesiones o abandono del programa.
          Se requiere doble confirmación para proceder.
        </AlertDescription>
      </Alert>
    )
  );

  const ComparisonTableSection = () => (
    <div className={`bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} p-6 rounded-lg`}>
      <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} font-semibold text-lg mb-4`}>
        Comparativa de Versiones
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-base">
          <thead>
            <tr className={`border-b-2 border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DIVIDER}`}>
              <th className={`text-left text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} py-4 font-semibold`}>
                Característica
              </th>
              <th className={`text-center text-${VERSION_SELECTION_CONFIG.THEME.SUCCESS} py-4 font-semibold`}>
                Adaptada
              </th>
              <th className={`text-center text-${VERSION_SELECTION_CONFIG.THEME.DANGER} py-4 font-semibold`}>
                Estricta
              </th>
            </tr>
          </thead>
          <tbody className={`text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY}`}>
            {[
              { feature: 'Intensidad inicial', adapted: 'Moderada', strict: 'Alta' },
              { feature: 'Volumen semanal', adapted: 'Bajo a medio', strict: 'Medio a alto' },
              { feature: 'Riesgo sobreentrenamiento', adapted: 'Bajo', strict: 'Alto' },
              { feature: 'Nivel requerido', adapted: 'Principiante+', strict: 'Intermedio+' }
            ].map((row) => (
              <tr key={row.feature} className={`border-b border-gray-700/50 hover:bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD_HOVER}`}>
                <td className="py-4 font-medium">{row.feature}</td>
                <td className={`text-center text-${VERSION_SELECTION_CONFIG.THEME.SUCCESS} py-4 font-medium`}>
                  {row.adapted}
                </td>
                <td className={`text-center text-${VERSION_SELECTION_CONFIG.THEME.DANGER} py-4 font-medium`}>
                  {row.strict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ConfirmationSection = () => (
    state.requiresConfirmation &&
    state.selectionMode === VERSION_SELECTION_CONFIG.MODES.MANUAL &&
    state.selectedVersion === VERSION_SELECTION_CONFIG.VERSIONS.STRICT && (
      <div className={`mt-4 p-4 bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.WARNING} border border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DANGER} rounded-lg`}>
        <h4 className={`text-${VERSION_SELECTION_CONFIG.THEME.DANGER} font-medium mb-2`}>
          Confirmación Requerida
        </h4>
        <p className={`text-sm text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} mb-3`}>
          Confirmo que entiendo los riesgos y quiero proceder con la versión estricta a pesar de mi nivel principiante.
        </p>
        <Button
          onClick={handleConfirmRisk}
          size="sm"
          className={`bg-${VERSION_SELECTION_CONFIG.THEME.DANGER} hover:bg-red-700 text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY}`}
        >
          Confirmo y Asumo los Riesgos
        </Button>
      </div>
    )
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-7xl w-[98vw] max-h-[90vh] overflow-y-auto bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.MODAL} border-${VERSION_SELECTION_CONFIG.THEME.BORDER.DEFAULT}`}>
        <DialogHeader>
          <DialogTitle className={`text-xl font-bold text-${VERSION_SELECTION_CONFIG.THEME.TEXT.PRIMARY} flex items-center gap-2`}>
            <Target className={`h-6 w-6 text-${VERSION_SELECTION_CONFIG.THEME.PRIMARY}`} />
            {isAutomatic ? 'Configurar Generación Automática' : 'Configurar Metodología'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 px-2">
          <UserProfileSection />
          <ModeSelectionSection />
          <VersionSelectionSection />
          <DurationSelectorSection />
          <WarningSection />
          <ComparisonTableSection />
        </div>

        <div className="flex justify-between pt-6 px-2">
          <Button
            variant="outline"
            onClick={() => { track('BUTTON_CLICK', { id: 'cancel' }, { component: 'MethodologyVersionSelectionModal' }); onClose(); }}
            className={`border-gray-600 text-${VERSION_SELECTION_CONFIG.THEME.TEXT.SECONDARY} hover:bg-${VERSION_SELECTION_CONFIG.THEME.BACKGROUND.CARD} px-8 py-3 text-base font-medium`}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className={`bg-${VERSION_SELECTION_CONFIG.THEME.PRIMARY} hover:bg-yellow-600 text-black font-semibold px-8 py-3 text-base`}
            disabled={state.requiresConfirmation && state.selectionMode === VERSION_SELECTION_CONFIG.MODES.MANUAL && state.selectedVersion === VERSION_SELECTION_CONFIG.VERSIONS.STRICT}
          >
            {state.requiresConfirmation && state.selectionMode === VERSION_SELECTION_CONFIG.MODES.MANUAL && state.selectedVersion === VERSION_SELECTION_CONFIG.VERSIONS.STRICT
              ? 'Confirmar Advertencia Primero'
              : 'Generar Entrenamiento'
            }
          </Button>
        </div>

        <ConfirmationSection />
      </DialogContent>
    </Dialog>
  );
}
*/

// Export vacío para evitar errores de importación
export default function MethodologyVersionSelectionModal() {
  return null;
}
