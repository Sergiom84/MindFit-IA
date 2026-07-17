import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { User, Activity, Target, Heart, Settings, Ruler, Dumbbell, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog.jsx';
import { EditableField } from '../EditableField';
import { BodyCompositionCalculator } from './BodyCompositionCalculator';
import { useProfileState } from '../../hooks/useProfileState';

// Importar todos los tabs
import { BasicInfoTab } from './BasicInfoTab';
import { BodyCompositionTab } from './BodyCompositionTab';
import { ExperienceTab } from './ExperienceTab';
import { GoalsTab } from './GoalsTab';
import { HealthTab } from './HealthTab';
import { SettingsTab } from './SettingsTab';
import { EquipmentTab } from './EquipmentTab';
import MusicConfigTab from './MusicConfigTab';
import tokenManager from '../../utils/tokenManager';

const ProfileSection = () => {
  // Leer ?tab=... para navegación directa
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('tab')
    if (t) setActiveTab(t)
  }, [])

  const [activeTab, setActiveTab] = useState('basic');
  const [pendingTab, setPendingTab] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Usar el hook personalizado para manejar el estado del perfil
  const profileState = useProfileState();

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const tabs = [
    {
      id: 'basic',
      label: 'Información Básica',
      icon: User,
      component: BasicInfoTab
    },
    {
      id: 'body',
      label: 'Composición Corporal',
      icon: Activity,
      component: BodyCompositionTab
    },
    {
      id: 'experience',
      label: 'Experiencia',
      icon: Ruler,
      component: ExperienceTab
    },
    {
      id: 'goals',
      label: 'Objetivos',
      icon: Target,
      component: GoalsTab
    },
    {
      id: 'health',
      label: 'Salud',
      icon: Heart,
      component: HealthTab
    },
    {
      id: 'settings',
      label: 'Preferencias',
      icon: Settings,
      component: SettingsTab
    },
    {
      id: 'equipment',
      label: 'Mi equipamiento',
      icon: Dumbbell,
      component: EquipmentTab
    },
    {
      id: 'music',
      label: 'Configuración de Música',
      icon: Music,
      component: MusicConfigTab
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [completionData, setCompletionData] = useState({});
  const [completionError, setCompletionError] = useState('');
  const [isCompositionCalculatorOpen, setIsCompositionCalculatorOpen] = useState(false);
  const [isCompositionSaving, setIsCompositionSaving] = useState(false);
  const [equipmentState, setEquipmentState] = useState({
    curated: [],
    custom: [],
    none: false,
    loading: true
  });
  const [equipmentRefresh, setEquipmentRefresh] = useState(0);

  const trainingDays = [
    { id: 'lunes', label: 'Lun' },
    { id: 'martes', label: 'Mar' },
    { id: 'miercoles', label: 'Mié' },
    { id: 'jueves', label: 'Jue' },
    { id: 'viernes', label: 'Vie' },
    { id: 'sabado', label: 'Sáb' },
    { id: 'domingo', label: 'Dom' }
  ];

  useEffect(() => {
    const token = tokenManager.getToken();
    if (!token) {
      setEquipmentState(prev => ({ ...prev, loading: false }));
      return;
    }

    fetch('/api/equipment/user', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        const curated = Array.isArray(data?.curated) ? data.curated : [];
        const custom = Array.isArray(data?.custom) ? data.custom : [];
        const hasNone = curated.some(item => item.key === 'no_equipment');
        const filteredCurated = curated.filter(item => item.key !== 'no_equipment');
        setEquipmentState({
          curated: filteredCurated,
          custom,
          none: hasNone,
          loading: false
        });
      })
      .catch(err => {
        console.error('Error cargando equipamiento:', err);
        setEquipmentState(prev => ({ ...prev, loading: false }));
      });
  }, [activeTab, isCompletionOpen, equipmentRefresh]);

  const handleEquipmentRefresh = () => {
    setEquipmentRefresh(prev => prev + 1);
  };

  const completionFields = useMemo(() => {
    const nivelOptions = [
      { value: 'principiante', label: 'Principiante' },
      { value: 'intermedio', label: 'Intermedio' },
      { value: 'avanzado', label: 'Avanzado' }
    ];

    const metodologiaOptions = [
      { value: 'powerlifting', label: 'Powerlifting' },
      { value: 'bodybuilding', label: 'Bodybuilding' },
      { value: 'crossfit', label: 'CrossFit' },
      { value: 'calistenia', label: 'Calistenia' },
      { value: 'entrenamiento_casa', label: 'Entrenamiento en Casa' },
      { value: 'heavy_duty', label: 'Heavy Duty' },
      { value: 'funcional', label: 'Entrenamiento Funcional' }
    ];

    return [
      { key: 'nombre', label: 'Nombre', category: 'Datos básicos', type: 'text' },
      { key: 'apellido', label: 'Apellido', category: 'Datos básicos', type: 'text' },
      { key: 'edad', label: 'Edad', category: 'Datos básicos', type: 'number' },
      { key: 'sexo', label: 'Sexo', category: 'Datos básicos', type: 'select', options: profileState.sexoOptions },
      { key: 'peso', label: 'Peso actual (kg)', category: 'Datos básicos', type: 'number' },
      { key: 'altura', label: 'Estatura (cm)', category: 'Datos básicos', type: 'number' },
      { key: 'nivel_actividad', label: 'Nivel de actividad', category: 'Datos básicos', type: 'select', options: [
        { value: 'sedentario', label: 'Sedentario' },
        { value: 'ligero', label: 'Ligero' },
        { value: 'moderado', label: 'Moderado' },
        { value: 'activo', label: 'Activo' },
        { value: 'muy_activo', label: 'Muy Activo' }
      ] },
      { key: 'enfoque', label: 'Enfoque seleccionado', category: 'Preferencias de entrenamiento', type: 'select', options: profileState.enfoqueOptions },
      { key: 'horario_preferido', label: 'Horario preferido', category: 'Preferencias de entrenamiento', type: 'select', options: profileState.horarioOptions },
      { key: 'comidas_diarias', label: 'Comidas diarias', category: 'Preferencias de entrenamiento', type: 'number' },
      { key: 'suplementacion', label: 'Suplementación', category: 'Preferencias de entrenamiento', type: 'list', noneOptionLabel: 'No tomo suplementación', noneOptionValue: 'Ninguna' },
      { key: 'alimentos_excluidos', label: 'Alimentos excluidos', category: 'Preferencias de entrenamiento', type: 'list', noneOptionLabel: 'No excluyo alimentos', noneOptionValue: 'Ninguno' },
      { key: 'nivel', label: 'Nivel actual', category: 'Experiencia', type: 'select', options: nivelOptions },
      { key: 'años_entrenando', label: 'Años entrenando', category: 'Experiencia', type: 'number' },
      { key: 'metodologia_preferida', label: 'Metodología preferida', category: 'Experiencia', type: 'select', options: metodologiaOptions },
      { key: 'frecuencia_semanal', label: 'Frecuencia semanal', category: 'Experiencia', type: 'number' },
      { key: 'grasa_corporal', label: 'Grasa corporal (%)', category: 'Composición corporal', type: 'number' },
      { key: 'masa_magra', label: 'Masa magra (kg)', category: 'Composición corporal', type: 'number' },
      { key: 'agua_corporal', label: 'Agua corporal (%)', category: 'Composición corporal', type: 'number' },
      { key: 'metabolismo_basal', label: 'Metabolismo basal (kcal)', category: 'Composición corporal', type: 'number' },
      { key: 'cintura', label: 'Cintura (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'pecho', label: 'Pecho (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'brazos', label: 'Brazos (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'muslo', label: 'Muslo (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'cuello', label: 'Cuello (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'antebrazos', label: 'Antebrazos (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'gemelo', label: 'Gemelo (cm)', category: 'Medidas corporales', type: 'number' },
      { key: 'pliegue_abdominal', label: 'Pliegue abdominal (mm)', category: 'Medidas corporales', type: 'number' },
      { key: 'cadera', label: 'Cadera (cm)', category: 'Medidas corporales', type: 'number', isRelevant: (profile) => profile?.sexo === 'femenino' },
      { key: 'objetivo_principal', label: 'Objetivo principal', category: 'Objetivos', type: 'select', options: profileState.objetivosOptions },
      { key: 'meta_peso', label: 'Meta de peso (kg)', category: 'Objetivos', type: 'number' },
      { key: 'meta_grasa', label: 'Meta de grasa corporal (%)', category: 'Objetivos', type: 'number' },
      { key: 'fecha_inicio_objetivo', label: 'Fecha de inicio', category: 'Seguimiento de progreso', type: 'date' },
      { key: 'fecha_meta_objetivo', label: 'Fecha meta', category: 'Seguimiento de progreso', type: 'date' },
      { key: 'notas_progreso', label: 'Notas de progreso', category: 'Seguimiento de progreso', type: 'textarea', isRelevant: () => false },
      { key: 'alergias', label: 'Alergias', category: 'Salud', type: 'list', noneOptionLabel: 'No tengo alergias', noneOptionValue: 'Ninguna' },
      { key: 'medicamentos', label: 'Medicamentos', category: 'Salud', type: 'list', noneOptionLabel: 'No tomo medicamentos', noneOptionValue: 'Ninguno' },
      { key: 'lesiones', label: 'Lesiones', category: 'Salud', type: 'list', noneOptionLabel: 'No tengo lesiones', noneOptionValue: 'Ninguna' },
      { key: 'usar_preferencias_ia', label: 'Preferencias personalizadas', category: 'Preferencias de entrenamiento IA', type: 'boolean' },
      { key: 'dias_preferidos_entrenamiento', label: 'Días preferidos', category: 'Preferencias de entrenamiento IA', type: 'training_days' },
      { key: 'ejercicios_por_dia_preferido', label: 'Ejercicios por día', category: 'Preferencias de entrenamiento IA', type: 'number' },
      { key: 'semanas_entrenamiento', label: 'Semanas de entrenamiento', category: 'Preferencias de entrenamiento IA', type: 'number' },
      { key: 'equipamiento', label: 'Equipamiento', category: 'Equipamiento', type: 'equipment' }
    ];
  }, [
    profileState.enfoqueOptions,
    profileState.horarioOptions,
    profileState.objetivosOptions,
    profileState.sexoOptions
  ]);

  const normalizeList = useCallback((list) => (
    Array.isArray(list)
      ? list.map(item => String(item || '').trim()).filter(Boolean)
      : []
  ), []);

  const isFieldComplete = useCallback((field, profile) => {
    const value = profile?.[field.key];
    if (field.type === 'equipment') {
      return equipmentState.none || equipmentState.curated.length > 0 || equipmentState.custom.length > 0;
    }
    if (field.type === 'list') {
      return normalizeList(value).length > 0;
    }
    if (field.type === 'boolean') {
      return typeof value === 'boolean';
    }
    if (field.type === 'training_days') {
      return normalizeList(value).length > 0;
    }
    return value !== null && value !== undefined && value !== '';
  }, [equipmentState, normalizeList]);

  const getRelevantFields = useCallback((profile) => completionFields.filter(field => (
    typeof field.isRelevant === 'function' ? field.isRelevant(profile) : true
  )), [completionFields]);

  const completionSummary = useMemo(() => {
    const relevant = getRelevantFields(profileState.userProfile);
    const missing = relevant.filter(field => !isFieldComplete(field, profileState.userProfile));
    const total = relevant.length;
    const completed = total - missing.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    const grouped = missing.reduce((acc, field) => {
      if (!acc[field.category]) acc[field.category] = [];
      acc[field.category].push(field);
      return acc;
    }, {});
    return {
      total,
      completed,
      percent,
      missing,
      grouped
    };
  }, [getRelevantFields, isFieldComplete, profileState.userProfile]);

  const profileProgress = completionSummary.percent;
  const editSectionLabels = {
    basic: 'Información básica',
    bodyComp: 'Composición corporal',
    bodyMeasures: 'Medidas corporales',
    experience: 'Experiencia',
    goals: 'Objetivos',
    goalProgress: 'Seguimiento de progreso',
    health: 'Salud',
    preferences: 'Preferencias'
  };

  const getEditSectionLabel = (section) =>
    editSectionLabels[section] || 'otra sección';

  const getTabLabel = (tabId) =>
    tabs.find(tab => tab.id === tabId)?.label || 'otra pestaña';

  const handleTabChange = (tabId) => {
    if (profileState.editingSection && activeTab !== tabId) {
      setPendingTab(tabId);
      return;
    }
    setActiveTab(tabId);
  };

  const handleCloseTabModal = () => {
    setPendingTab(null);
  };

  const handleSaveAndSwitchTab = async () => {
    if (!pendingTab) return;
    await profileState.handleSave();
    setActiveTab(pendingTab);
    setPendingTab(null);
  };

  const handleDiscardAndSwitchTab = () => {
    if (!pendingTab) return;
    profileState.handleCancel();
    setActiveTab(pendingTab);
    setPendingTab(null);
  };

  useEffect(() => {
    if (!isCompletionOpen) return;
    const initial = {};
    completionSummary.missing.forEach((field) => {
      if (field.type === 'equipment') return;
      if (field.type === 'training_days') {
        initial[field.key] = profileState.userProfile?.dias_preferidos_entrenamiento?.length
          ? profileState.userProfile.dias_preferidos_entrenamiento
          : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
        return;
      }
      if (field.key === 'ejercicios_por_dia_preferido') {
        initial[field.key] = profileState.userProfile?.ejercicios_por_dia_preferido || 8;
        return;
      }
      if (field.key === 'semanas_entrenamiento') {
        initial[field.key] = profileState.userProfile?.semanas_entrenamiento || 4;
        return;
      }
      if (field.key === 'usar_preferencias_ia') {
        initial[field.key] = profileState.userProfile?.usar_preferencias_ia ?? null;
        return;
      }
      if (field.type === 'list') {
        initial[field.key] = Array.isArray(profileState.userProfile?.[field.key])
          ? profileState.userProfile[field.key]
          : [];
        return;
      }
      initial[field.key] = profileState.userProfile?.[field.key] ?? '';
    });
    setCompletionData(initial);
    setCompletionError('');
  }, [completionSummary.missing, isCompletionOpen, profileState.userProfile]);

  const handleCompletionInputChange = (field, value) => {
    setCompletionData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getCompletionValue = (field, fallback) => (
    Object.prototype.hasOwnProperty.call(completionData, field)
      ? completionData[field]
      : fallback
  );

  const toggleTrainingDay = (dayId) => {
    const current = getCompletionValue('dias_preferidos_entrenamiento', []);
    const next = current.includes(dayId)
      ? current.filter(day => day !== dayId)
      : [...current, dayId];
    handleCompletionInputChange('dias_preferidos_entrenamiento', next);
  };

  const handleNoEquipmentToggle = async (checked) => {
    const token = tokenManager.getToken();
    if (!token) return;

    try {
      if (checked) {
        await fetch('/api/equipment/user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ equipment_type: 'no_equipment' })
        });

        await Promise.all([
          ...equipmentState.curated.map(item =>
            fetch(`/api/equipment/user/${item.key}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            })
          ),
          ...equipmentState.custom.map(item =>
            fetch(`/api/equipment/custom/${item.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            })
          )
        ]);

        setEquipmentState({
          curated: [],
          custom: [],
          none: true,
          loading: false
        });
        return;
      }

      await fetch('/api/equipment/user/no_equipment', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setEquipmentState(prev => ({ ...prev, none: false }));
    } catch (error) {
      console.error('Error actualizando equipamiento:', error);
    }
  };

  const handleCompositionCalculate = async (results) => {
    if (!results) return;
    setIsCompositionSaving(true);

    const compositionData = {
      grasa_corporal: results.porcentaje_grasa,
      masa_magra: results.masa_magra,
      muslo: results.muslo ?? profileState.userProfile.muslo ?? profileState.userProfile.muslos,
      agua_corporal: results.agua_corporal,
      metabolismo_basal: results.metabolismo_basal
    };

    const success = await profileState.saveProfileData(compositionData);
    if (!success) {
      setCompletionError('No se pudo guardar la composición corporal.');
      setIsCompositionSaving(false);
      return;
    }

    setCompletionData(prev => ({ ...prev, ...compositionData }));
    setCompletionError('');
    setIsCompositionSaving(false);
  };

  const handleCompletionSave = async () => {
    setCompletionError('');
    const missingKeys = new Set(completionSummary.missing.map(field => field.key));
    const trainingKeys = [
      'usar_preferencias_ia',
      'dias_preferidos_entrenamiento',
      'ejercicios_por_dia_preferido',
      'semanas_entrenamiento'
    ];

    const trainingPayload = {};
    const profilePayload = {};

    Object.entries(completionData).forEach(([key, value]) => {
      if (trainingKeys.includes(key)) {
        trainingPayload[key] = value;
        return;
      }
      profilePayload[key] = value;
    });

    if (missingKeys.has('usar_preferencias_ia') && typeof trainingPayload.usar_preferencias_ia !== 'boolean') {
      setCompletionError('Selecciona si quieres activar preferencias personalizadas.');
      return;
    }

    if (missingKeys.has('dias_preferidos_entrenamiento')) {
      const days = trainingPayload.dias_preferidos_entrenamiento || [];
      if (!Array.isArray(days) || days.length === 0) {
        setCompletionError('Selecciona al menos un día preferido.');
        return;
      }
    }

    if (missingKeys.has('ejercicios_por_dia_preferido')) {
      const value = Number(trainingPayload.ejercicios_por_dia_preferido);
      if (!Number.isFinite(value) || value < 4 || value > 15) {
        setCompletionError('Ejercicios por día debe estar entre 4 y 15.');
        return;
      }
    }

    if (missingKeys.has('semanas_entrenamiento')) {
      const value = Number(trainingPayload.semanas_entrenamiento);
      if (!Number.isFinite(value) || value < 1 || value > 8) {
        setCompletionError('Semanas de entrenamiento debe estar entre 1 y 8.');
        return;
      }
    }

    const saveResults = [];
    if (Object.keys(profilePayload).length > 0) {
      saveResults.push(profileState.saveProfileData(profilePayload));
    }
    if (Object.keys(trainingPayload).length > 0) {
      saveResults.push(profileState.saveTrainingPreferences(trainingPayload));
    }

    if (saveResults.length === 0) {
      setCompletionError('No hay cambios para guardar.');
      return;
    }

    const results = await Promise.all(saveResults);
    if (!results.some(Boolean)) {
      setCompletionError('No se pudo guardar la información.');
      return;
    }

    const nextProfile = { ...profileState.userProfile, ...profilePayload, ...trainingPayload };
    const nextMissing = getRelevantFields(nextProfile).filter(field => !isFieldComplete(field, nextProfile));

    if (nextMissing.length === 0) {
      setIsCompletionOpen(false);
      setCompletionData({});
      return;
    }

    setCompletionError(`Aún faltan ${nextMissing.length} campos por completar.`);
  };

  const groupedMissing = Object.entries(completionSummary.grouped);
  const hasMissingFields = completionSummary.missing.length > 0;

  const renderCompletionField = (field) => {
    const completionCardClass = "rounded-xl border border-white/10 border-l-2 border-l-yellow-400/30 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-4 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.9)]";

    if (field.type === 'equipment') {
      return (
        <div key={field.key} className={completionCardClass}>
          <p className="text-sm text-gray-200/80 mb-3">Equipamiento</p>
          <label className="flex items-center gap-2 text-sm text-gray-200/90">
            <input
              type="checkbox"
              checked={equipmentState.none}
              onChange={(e) => handleNoEquipmentToggle(e.target.checked)}
              className="h-4 w-4 accent-yellow-400"
            />
            No tengo equipamiento
          </label>
          <button
            type="button"
            onClick={() => {
              setIsCompletionOpen(false);
              handleTabChange('equipment');
            }}
            className="mt-3 text-xs text-yellow-400 hover:text-yellow-300 underline"
          >
            Ir a mi equipamiento
          </button>
        </div>
      );
    }

    if (field.type === 'training_days') {
      const selectedDays = getCompletionValue('dias_preferidos_entrenamiento', []);
      return (
        <div key={field.key} className={completionCardClass}>
          <p className="text-sm text-gray-200/80 mb-3">Días preferidos</p>
          <div className="grid grid-cols-7 gap-2">
            {trainingDays.map(day => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleTrainingDay(day.id)}
                className={`py-2 rounded text-xs font-medium transition ${
                  selectedDays.includes(day.id)
                    ? 'bg-yellow-400 text-black'
                    : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === 'boolean') {
      const currentValue = getCompletionValue('usar_preferencias_ia', profileState.userProfile?.usar_preferencias_ia ?? null);
      return (
        <div key={field.key} className={completionCardClass}>
          <p className="text-sm text-gray-200/80 mb-3">Preferencias personalizadas</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleCompletionInputChange('usar_preferencias_ia', true)}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                currentValue === true
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
              }`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => handleCompletionInputChange('usar_preferencias_ia', false)}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                currentValue === false
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
              }`}
            >
              No
            </button>
          </div>
        </div>
      );
    }

    if (field.key === 'ejercicios_por_dia_preferido' || field.key === 'semanas_entrenamiento') {
      const value = getCompletionValue(field.key, '');
      const config = field.key === 'ejercicios_por_dia_preferido'
        ? { min: 4, max: 15 }
        : { min: 1, max: 8 };
      return (
        <div key={field.key} className={completionCardClass}>
          <label className="text-sm text-gray-200/80 mb-2 block">{field.label}</label>
          <input
            type="number"
            min={config.min}
            max={config.max}
            value={value}
            onChange={(e) => handleCompletionInputChange(field.key, e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-yellow-400"
          />
        </div>
      );
    }

    const inputType = field.type === 'number'
      ? 'number'
      : field.type === 'date'
        ? 'date'
        : field.type === 'textarea'
          ? 'textarea'
          : 'text';

    return (
      <div key={field.key} className={completionCardClass}>
        <EditableField
          label={field.label}
          field={field.key}
          value={profileState.userProfile?.[field.key]}
          editing={true}
          editedData={completionData}
          onInputChange={handleCompletionInputChange}
          type={inputType}
          options={field.type === 'select' ? field.options : null}
          isList={field.type === 'list'}
          noneOptionLabel={field.noneOptionLabel}
          noneOptionValue={field.noneOptionValue}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-24 right-0 h-60 w-60 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-72 w-72 bg-yellow-400/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Encabezado principal */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Perfil</p>
            <h1 className="text-4xl md:text-5xl font-semibold font-urbanist text-white">
              Mi Perfil
            </h1>
            <p className="text-lg text-gray-200/80 max-w-3xl">
              Completa tu información personal para obtener entrenamientos más precisos y personalizados
            </p>
          </div>

          {/* Indicador de progreso */}
          <button
            type="button"
            onClick={() => setIsCompletionOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            title="Ver campos pendientes"
          >
            <span className="text-sm text-gray-300/70 group-hover:text-gray-200">Perfil completado:</span>
            <div className="flex items-center">
              <div className="w-24 bg-white/10 rounded-full h-2 mr-2 overflow-hidden">
                <div
                  className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${profileProgress}%` }}
                ></div>
              </div>
              <span className="text-sm font-medium text-yellow-400">{profileProgress}%</span>
            </div>
          </button>
        </div>

        {/* Navegación por tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
                  : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
              }`}
            >
              <tab.icon size={18} className="mr-2" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Contenido del tab activo */}
        <div>
          {ActiveComponent && (
            <ActiveComponent
              {...profileState}
              currentUser={JSON.parse(localStorage.getItem('user') || '{}')}
              userId={JSON.parse(localStorage.getItem('user') || '{}').id}
              onEquipmentChange={handleEquipmentRefresh}
            />
          )}
        </div>
      </div>
      <Dialog open={!!pendingTab} onOpenChange={(open) => !open && handleCloseTabModal()}>
        <DialogContent className="max-w-lg bg-neutral-900/85 border border-white/10 ring-1 ring-white/5 text-white">
          <DialogHeader>
            <DialogTitle>Cambios sin guardar</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar en {getEditSectionLabel(profileState.editingSection)}.
              ¿Quieres guardar o descartar antes de cambiar a {getTabLabel(pendingTab)}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 text-gray-200/80 hover:bg-white/10"
              onClick={handleCloseTabModal}
            >
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-red-500/40 text-red-300 hover:bg-red-500/20"
              onClick={handleDiscardAndSwitchTab}
            >
              Descartar
            </Button>
            <Button
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={handleSaveAndSwitchTab}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isCompletionOpen} onOpenChange={setIsCompletionOpen}>
        <DialogContent className="max-w-4xl bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 text-white shadow-2xl backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Completa tu perfil</DialogTitle>
            <DialogDescription>
              Revisa los campos pendientes para alcanzar el 100%.
            </DialogDescription>
          </DialogHeader>
          {hasMissingFields ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              {groupedMissing.map(([category, fields]) => (
                <div key={category} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">
                      {category}
                    </h3>
                    {category === 'Composición corporal' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
                        onClick={() => setIsCompositionCalculatorOpen(true)}
                        disabled={isCompositionSaving}
                      >
                        {isCompositionSaving ? 'Guardando...' : 'Abrir calculadora'}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map(renderCompletionField)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-200/80">
              ¡Perfil completo! 🎉
            </div>
          )}
          {completionError && (
            <p className="text-sm text-red-400">{completionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 text-gray-200/80 hover:bg-white/10"
              onClick={() => setIsCompletionOpen(false)}
            >
              Cerrar
            </Button>
            {hasMissingFields && (
              <Button
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-900"
                onClick={handleCompletionSave}
              >
                Guardar faltantes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BodyCompositionCalculator
        isOpen={isCompositionCalculatorOpen}
        onClose={() => setIsCompositionCalculatorOpen(false)}
        onCalculate={handleCompositionCalculate}
        userProfile={profileState.userProfile}
      />
    </div>
  );
};

export default memo(ProfileSection);
