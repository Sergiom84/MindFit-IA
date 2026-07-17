import { useState, useEffect, useMemo, useCallback } from 'react'
import tokenManager from '../utils/tokenManager';

export const useProfileState = () => {
  const defaultProfile = useMemo(() => ({
    // Datos básicos
    nombre: '',
    apellido: '',
    email: '',
    edad: '',
    sexo: '',
    peso: '',
    altura: '',
    nivel_actividad: '',
    // Experiencia
    nivel: '', // UI -> DB: nivel_entrenamiento
    años_entrenando: '', // UI -> DB: anos_entrenando
    frecuencia_semanal: '',
    metodologia_preferida: '',
    // Preferencias
    enfoque: '', // UI -> DB: enfoque_entrenamiento
    horario_preferido: '',
    comidas_diarias: '', // UI -> DB: comidas_por_dia
    suplementacion: [],
    alimentos_excluidos: [],
    // Preferencias entrenamiento IA (user_profiles)
    usar_preferencias_ia: null,
    dias_preferidos_entrenamiento: [],
    ejercicios_por_dia_preferido: '',
    semanas_entrenamiento: '',
    // Objetivos y Metas
    objetivo_principal: '',
    meta_peso: '',
    meta_grasa: '',
    peso_inicio_objetivo: '',
    objetivo_activo_desde: '',
    goal_progress_pct: 0,
    fecha_meta_objetivo: '',
    notas_progreso: '',
    // Salud
    historial_medico: '',
    limitaciones_fisicas: [],
    alergias: [],
    medicamentos: [],
    lesiones: [],
    // Composición corporal
    grasa_corporal: '',
    masa_magra: '',
    agua_corporal: '',
    metabolismo_basal: '',
    cintura: '',
    pecho: '',
    brazos: '',
    muslo: '',
    cuello: '',
    antebrazos: '',
    cadera: '',
    gemelo: '',
    pliegue_abdominal: '',
    // Documentación médica
    medical_docs: [],
  }), [])

  const [userProfile, setUserProfile] = useState(defaultProfile)
  const [editingSection, setEditingSection] = useState(null)
  const [editedData, setEditedData] = useState({})

  const getAuthSession = useCallback(() => {
    const token = tokenManager.getToken()
    if (!token) return { token: null, userId: null }

    const userKeys = ['user', 'userProfile', 'userData']
    for (const key of userKeys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw)
        const directId = parsed?.id
        const nestedId = parsed?.user?.id
        const userId = directId ?? nestedId ?? null
        if (userId) return { token, userId: Number(userId) }
      } catch {
        // Ignorar JSON inválido en claves legacy.
      }
    }

    return { token, userId: null }
  }, [])

  // Helpers de mapeo UI<->DB
  const toNumber = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
  const normalizeBodyCompositionFields = (data = {}) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data

    const normalized = { ...data }

    if (!Object.prototype.hasOwnProperty.call(normalized, 'masa_magra') &&
        Object.prototype.hasOwnProperty.call(normalized, 'masa_muscular')) {
      normalized.masa_magra = normalized.masa_muscular
    }

    if (!Object.prototype.hasOwnProperty.call(normalized, 'muslo') &&
        Object.prototype.hasOwnProperty.call(normalized, 'muslos')) {
      normalized.muslo = normalized.muslos
    }

    delete normalized.masa_muscular
    delete normalized.muslos

    return normalized
  }

  const mapDbToUi = useCallback((u = {}) => {
    const normalized = normalizeBodyCompositionFields(u)
    const masaMagra = normalized.masa_magra ?? ''
    const muslo = normalized.muslo ?? ''

    return {
      ...defaultProfile,
      // Básicos
      nombre: u.nombre || '',
      apellido: u.apellido || '',
      email: u.email || '',
      edad: u.edad ?? '',
      sexo: u.sexo || '',
      peso: u.peso ?? '',
      altura: u.altura ?? '',
      nivel_actividad: u.nivel_actividad || '',
      // Experiencia
      nivel: u.nivel_entrenamiento || '',
      años_entrenando: u.anos_entrenando ?? u["años_entrenando"] ?? '',
      frecuencia_semanal: u.frecuencia_semanal ?? '',
      metodologia_preferida: u.metodologia_preferida || '',
      // Preferencias
      enfoque: u.enfoque_entrenamiento || '',
      horario_preferido: u.horario_preferido || '',
      comidas_diarias: u.comidas_por_dia ?? '',
      suplementacion: u.suplementacion || [],
      alimentos_excluidos: u.alimentos_excluidos || [],
      // Preferencias entrenamiento IA
      usar_preferencias_ia: u.usar_preferencias_ia ?? null,
      dias_preferidos_entrenamiento: Array.isArray(u.dias_preferidos_entrenamiento)
        ? u.dias_preferidos_entrenamiento
        : [],
      ejercicios_por_dia_preferido: u.ejercicios_por_dia_preferido ?? '',
      semanas_entrenamiento: u.semanas_entrenamiento ?? '',
      // Objetivos y Metas
      objetivo_principal: u.objetivo_principal || u.u_objetivo_principal || '',
      meta_peso: u.meta_peso ?? '',
      // UI key 'meta_grasa' -> DB canónica 'meta_grasa_corporal' (dup 'meta_grasa' retirada, DATA-003)
      meta_grasa: u.meta_grasa_corporal ?? u.meta_grasa ?? '',
      peso_inicio_objetivo: u.peso_inicio_objetivo ?? '',
      objetivo_activo_desde: u.objetivo_activo_desde ?? '',
      goal_progress_pct: u.goal_progress_pct ?? 0,
      fecha_meta_objetivo: u.fecha_meta_objetivo || '',
      notas_progreso: u.notas_progreso || '',
      // Salud
      historial_medico: u.historial_medico || '',
      limitaciones_fisicas: u.limitaciones_fisicas || [],
      alergias: u.alergias || [],
      medicamentos: u.medicamentos || [],
      lesiones: u.lesiones || [],
      // Composición
      grasa_corporal: normalized.grasa_corporal ?? '',
      masa_magra: masaMagra,
      agua_corporal: normalized.agua_corporal ?? '',
      metabolismo_basal: normalized.metabolismo_basal ?? '',
      cintura: normalized.cintura ?? '',
      pecho: normalized.pecho ?? '',
      brazos: normalized.brazos ?? '',
      muslo,
      cuello: normalized.cuello ?? '',
      antebrazos: normalized.antebrazos ?? '',
      cadera: normalized.cadera ?? '',
      gemelo: normalized.gemelo ?? '',
      pliegue_abdominal: normalized.pliegue_abdominal ?? ''
    }
  }, [defaultProfile])

  const mapUiToDb = (data = {}) => {
    const payload = normalizeBodyCompositionFields({ ...data })
    if ('años_entrenando' in payload) {
      payload.anos_entrenando = toNumber(payload['años_entrenando'])
      delete payload['años_entrenando']
    }
    if ('nivel' in payload) {
      payload.nivel_entrenamiento = payload.nivel
      delete payload.nivel
    }
    if ('comidas_diarias' in payload) {
      payload.comidas_por_dia = toNumber(payload.comidas_diarias)
      delete payload.comidas_diarias
    }
    if ('enfoque' in payload) {
      payload.enfoque_entrenamiento = payload.enfoque
      delete payload.enfoque
    }
    if ('meta_grasa' in payload) {
      payload.meta_grasa_corporal = toNumber(payload.meta_grasa)
      delete payload.meta_grasa
    }
    // Normalizar numéricos comunes
    ;['edad','peso','altura','grasa_corporal','masa_magra','agua_corporal','metabolismo_basal','cintura','pecho','brazos','muslo','cuello','antebrazos','cadera','gemelo','pliegue_abdominal','frecuencia_semanal','meta_peso','meta_grasa_corporal']
      .forEach(k => { if (k in payload) payload[k] = toNumber(payload[k]) })
    return payload
  }

  // Cargar perfil desde localStorage (clave dedicada) y luego desde la API
  useEffect(() => {
    // Migración: si existe 'userProfile' sin "id", moverlo a 'profileData' para no
    // interferir con AuthContext (que usa STORAGE_KEYS.USER = 'userProfile').
    try {
      const legacyUP = localStorage.getItem('userProfile')
      if (legacyUP) {
        const parsed = JSON.parse(legacyUP)
        if (parsed && typeof parsed === 'object' && parsed.id === undefined) {
          localStorage.setItem('profileData', legacyUP)
          localStorage.removeItem('userProfile')
        }
      }
    } catch (error) {
      // Ignorar errores de parsing de userProfile legacy
      console.debug('Error parsing legacy userProfile:', error)
    }

    const savedProfile = localStorage.getItem('profileData')
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile)
      setUserProfile({ ...defaultProfile, ...normalizeBodyCompositionFields(parsed) })
    }

    // Intentar cargar desde API si hay usuario autenticado (claves legacy por ahora)
    const { token, userId } = getAuthSession()
    if (token && userId) {
      fetch(`/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => r.ok ? r.json() : Promise.reject(r))
          .then(data => {
            if (data?.user) {
              const ui = mapDbToUi(data.user)
              setUserProfile(ui)
              localStorage.setItem('profileData', JSON.stringify(ui))
            }
          })
          .catch(err => console.error('Error cargando perfil desde API:', err))
    }
  }, [defaultProfile, mapDbToUi, getAuthSession])

  // Guardar datos del perfil en localStorage cuando cambien (clave dedicada)
  useEffect(() => {
    localStorage.setItem('profileData', JSON.stringify(userProfile))
  }, [userProfile])

  // Funciones helper
  const calculateIMC = (peso, altura) => {
    if (!peso || !altura) return null
    const alturaM = altura / 100
    return (peso / (alturaM * alturaM)).toFixed(1)
  }

  const getIMCCategory = (imc) => {
    if (!imc) return ''
    if (imc < 18.5) return 'Bajo peso'
    if (imc < 25) return 'Peso normal'
    if (imc < 30) return 'Sobrepeso'
    return 'Obesidad'
  }

  const getIMCCategoryColor = (imc) => {
    if (!imc) return 'text-gray-400'
    if (imc < 18.5) return 'text-blue-400'
    if (imc < 25) return 'text-green-400'
    if (imc < 30) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getSexoLabel = (sexo) => {
    const labels = {
      masculino: 'Masculino',
      femenino: 'Femenino'
    }
    return labels[sexo] || 'No especificado'
  }

  const getNivelActividadLabel = (nivel) => {
    const labels = {
      sedentario: 'Sedentario',
      ligero: 'Ligero',
      moderado: 'Moderado',
      activo: 'Activo',
      muy_activo: 'Muy Activo'
    }
    return labels[nivel] || 'No especificado'
  }

  const sexoOptions = [
    { value: 'masculino', label: 'Masculino' },
    { value: 'femenino', label: 'Femenino' }
  ]

  // Funciones adicionales para ExperienceCard
  const getMetodologiaLabel = (metodologia) => {
    const labels = {
      powerlifting: 'Powerlifting',
      bodybuilding: 'Bodybuilding',
      crossfit: 'CrossFit',
      calistenia: 'Calistenia',
      entrenamiento_casa: 'Entrenamiento en Casa',
      heavy_duty: 'Heavy Duty',
      funcional: 'Entrenamiento Funcional'
    }
    return labels[metodologia] || 'No especificado'
  }

  // Funciones adicionales para PreferencesCard
  const enfoqueOptions = [
    { value: 'fuerza', label: 'Fuerza' },
    { value: 'hipertrofia', label: 'Hipertrofia' },
    { value: 'resistencia', label: 'Resistencia' },
    { value: 'perdida_peso', label: 'Pérdida de Peso' },
    { value: 'general', label: 'Acondicionamiento General' }
  ]

  const horarioOptions = [
    { value: 'mañana', label: 'Mañana (7:00 a 11:00)' },
    { value: 'media_mañana', label: 'Media mañana (12:00 a 16:00)' },
    { value: 'tarde', label: 'Tarde (17:00 a 20h)' },
    { value: 'noche', label: 'Noche (21h a 00h)' }
  ]

  const getEnfoqueLabel = (enfoque) => {
    const labels = {
      fuerza: 'Fuerza',
      hipertrofia: 'Hipertrofia',
      resistencia: 'Resistencia',
      perdida_peso: 'Pérdida de Peso',
      general: 'Acondicionamiento General'
    }
    return labels[enfoque] || 'No especificado'
  }

  const getHorarioLabel = (horario) => {
    const labels = {
      mañana: 'Mañana (7:00 a 11:00)',
      media_mañana: 'Media mañana (12:00 a 16:00)',
      tarde: 'Tarde (17:00 a 20h)',
      noche: 'Noche (21h a 00h)'
    }
    return labels[horario] || 'No especificado'
  }

  // Opciones y funciones para GoalsCard
  const objetivosOptions = [
    { value: 'ganar_peso', label: 'Ganar Peso' },
    { value: 'rehabilitacion', label: 'Rehabilitación' },
    { value: 'perder_peso', label: 'Perder Peso' },
    { value: 'tonificar', label: 'Tonificar' },
    { value: 'ganar_masa_muscular', label: 'Ganar Masa Muscular' },
    { value: 'mejorar_resistencia', label: 'Mejorar Resistencia' },
    { value: 'mejorar_flexibilidad', label: 'Mejorar Flexibilidad' },
    { value: 'salud_general', label: 'Salud General' },
    { value: 'mantenimiento', label: 'Mantenimiento' }
  ]

  const getObjetivoLabel = (objetivo) => {
    const labels = {
      ganar_peso: 'Ganar Peso',
      rehabilitacion: 'Rehabilitación',
      perder_peso: 'Perder Peso',
      tonificar: 'Tonificar',
      ganar_masa_muscular: 'Ganar Masa Muscular',
      mejorar_resistencia: 'Mejorar Resistencia',
      mejorar_flexibilidad: 'Mejorar Flexibilidad',
      salud_general: 'Salud General',
      mantenimiento: 'Mantenimiento'
    }
    return labels[objetivo] || 'No especificado'
  }

  // Listas para suplementación y alimentos (simuladas por ahora)
  const suplementacionList = userProfile.suplementacion || []
  const alimentosList = userProfile.alimentos_excluidos || []

  const suplementacionObjList = suplementacionList.map(item => ({ name: item }))
  const alimentosObjList = alimentosList.map(item => ({ name: item }))

  // Listas para HealthTab
  const alergiasList = userProfile.alergias || []
  const medicamentosList = userProfile.medicamentos || []
  const lesionesList = userProfile.lesiones || []

  const alergiasObjList = alergiasList.map(item => ({ name: item }))
  const medicamentosObjList = medicamentosList.map(item => ({ name: item }))
  const lesionesObjList = lesionesList.map(item => ({ name: item }))

  // Props para documentos (simuladas por ahora)
  const docs = []
  const fetchDocs = () => {}
  const setDocsOpen = () => {}
  const fileInputRef = { current: null }
  const handlePdfUpload = () => {}

  // Funciones de manejo de estado
  const startEdit = (section, initialData) => {
    setEditingSection(section)
    setEditedData(initialData)
  }

  const handleSave = async () => {
    if (!editingSection) return

    const normalizedData = normalizeBodyCompositionFields(editedData)

    // Actualizar UI inmediata
    setUserProfile(prev => ({ ...prev, ...normalizedData }))

    try {
      const { token, userId } = getAuthSession()
      if (!token || !userId) return

      const payload = mapUiToDb(normalizedData)

      const resp = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!resp.ok) {
        console.error('Error guardando perfil:', await resp.text())
      } else {
        const data = await resp.json()
        if (data?.user) {
          const ui = mapDbToUi(data.user)
          setUserProfile(ui)
          localStorage.setItem('profileData', JSON.stringify(ui))
        }
      }
    } catch (e) {
      console.error('Error en handleSave:', e)
    } finally {
      setEditingSection(null)
      setEditedData({})
    }
  }

  const handleCancel = () => {
    setEditingSection(null)
    setEditedData({})
  }

  const saveProfileData = async (data = {}) => {
    if (!data || Object.keys(data).length === 0) return false

    const normalizedData = normalizeBodyCompositionFields(data)

    setUserProfile(prev => ({ ...prev, ...normalizedData }))

    try {
      const { token, userId } = getAuthSession()
      if (!token || !userId) return false

      const payload = mapUiToDb(normalizedData)

      const resp = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!resp.ok) {
        console.error('Error guardando perfil:', await resp.text())
        return false
      }

      const dataResp = await resp.json()
      if (dataResp?.user) {
        const ui = mapDbToUi(dataResp.user)
        setUserProfile(ui)
        localStorage.setItem('profileData', JSON.stringify(ui))
      }

      return true
    } catch (e) {
      console.error('Error en saveProfileData:', e)
      return false
    }
  }

  const saveTrainingPreferences = async (data = {}) => {
    if (!data || Object.keys(data).length === 0) return false

    setUserProfile(prev => ({ ...prev, ...data }))

    try {
      const { token, userId } = getAuthSession()
      if (!token || !userId) return false

      const payload = {
        usar_preferencias_ia: data.usar_preferencias_ia,
        dias_preferidos_entrenamiento: data.dias_preferidos_entrenamiento,
        ejercicios_por_dia_preferido: data.ejercicios_por_dia_preferido,
        semanas_entrenamiento: data.semanas_entrenamiento
      }

      const resp = await fetch(`/api/users/${userId}/training-preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!resp.ok) {
        console.error('Error guardando preferencias de entrenamiento:', await resp.text())
        return false
      }

      return true
    } catch (e) {
      console.error('Error en saveTrainingPreferences:', e)
      return false
    }
  }

  const resetGoalProgress = async () => {
    try {
      const { token, userId } = getAuthSession()
      if (!token || !userId) return false

      const resp = await fetch(`/api/users/${userId}/objective/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!resp.ok) {
        console.error('Error reiniciando progreso:', await resp.text())
        return false
      }

      const data = await resp.json()
      if (data?.user) {
        const ui = mapDbToUi(data.user)
        setUserProfile(ui)
        localStorage.setItem('profileData', JSON.stringify(ui))
      }

      return true
    } catch (e) {
      console.error('Error en resetGoalProgress:', e)
      return false
    }
  }

  const handleInputChange = (field, value) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return {
    userProfile,
    editingSection,
    editedData,
    startEdit,
    handleSave,
    handleCancel,
    handleInputChange,
    resetGoalProgress,
    saveProfileData,
    saveTrainingPreferences,
    sexoOptions,
    getSexoLabel,
    getNivelActividadLabel,
    calculateIMC,
    getIMCCategory,
    getIMCCategoryColor,
    setUserProfile,
    // Funciones para ExperienceCard
    getMetodologiaLabel,
    // Funciones y datos para PreferencesCard
    enfoqueOptions,
    horarioOptions,
    getEnfoqueLabel,
    getHorarioLabel,
    // Funciones y datos para GoalsCard
    objetivosOptions,
    getObjetivoLabel,
    suplementacionList,
    alimentosList,
    suplementacionObjList,
    alimentosObjList,
    // Props para HealthTab
    alergiasList,
    medicamentosList,
    lesionesList,
    alergiasObjList,
    medicamentosObjList,
    lesionesObjList,
    docs,
    fetchDocs,
    setDocsOpen,
    fileInputRef,
    handlePdfUpload
  }
}
