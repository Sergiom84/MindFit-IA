import { useState, useEffect, useMemo, useCallback } from 'react'
import tokenManager from '../utils/tokenManager';
import { alertDialog } from '../components/ui/dialogService';
import {
  SEXO_OPTIONS,
  ENFOQUE_OPTIONS,
  HORARIO_OPTIONS,
  OBJETIVO_OPTIONS,
  getSexoLabel,
  getNivelActividadLabel,
  getMetodologiaLabel,
  getEnfoqueLabel,
  getHorarioLabel,
  getObjetivoLabel
} from '../config/catalogs';

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
  const [isSaving, setIsSaving] = useState(false)

  // ONB-P1-04: la caché de perfil se guarda por usuario. Sin el userId en la clave,
  // el perfil de una cuenta sobrevivía al logout y lo leía la siguiente.
  const profileCacheKey = (userId) => `profileData:${userId}`

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

  // Escribe la caché siempre bajo el usuario en sesión. Si no hay sesión no se
  // escribe nada: un perfil sin dueño es justo lo que provocaba la fuga.
  const writeProfileCache = useCallback((profile) => {
    const { userId } = getAuthSession()
    if (!userId) return
    localStorage.setItem(profileCacheKey(userId), JSON.stringify(profile))
  }, [getAuthSession])

  // Cargar perfil desde localStorage (clave dedicada) y luego desde la API
  useEffect(() => {
    const { token, userId } = getAuthSession()

    // ONB-P1-04: la caché iba en la clave global 'profileData', sin usuario y sin
    // limpiarse al cerrar sesión, así que la cuenta B podía arrancar mostrando el
    // perfil (incluidos datos de salud) de la cuenta A. Se descarta cualquier resto
    // de la clave antigua: no hay forma de saber de quién era, y la API la repuebla.
    localStorage.removeItem('profileData')
    localStorage.removeItem('userProfile')

    const savedProfile = userId ? localStorage.getItem(profileCacheKey(userId)) : null
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile)
        setUserProfile({ ...defaultProfile, ...normalizeBodyCompositionFields(parsed) })
      } catch (error) {
        console.debug('Caché de perfil ilegible, se descarta:', error)
        localStorage.removeItem(profileCacheKey(userId))
      }
    }

    // Intentar cargar desde API si hay usuario autenticado (claves legacy por ahora)
    if (token && userId) {
      fetch(`/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => r.ok ? r.json() : Promise.reject(r))
          .then(data => {
            if (data?.user) {
              const ui = mapDbToUi(data.user)
              setUserProfile(ui)
              writeProfileCache(ui)
            }
          })
          .catch(err => console.error('Error cargando perfil desde API:', err))
    }
  }, [defaultProfile, mapDbToUi, getAuthSession, writeProfileCache])

  // Guardar datos del perfil en localStorage cuando cambien (clave dedicada)
  useEffect(() => {
    writeProfileCache(userProfile)
  }, [userProfile, writeProfileCache])

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

  // F2 (ONB-P2-01/02/P3-01): opciones y etiquetas provienen del catálogo canónico
  // único (src/config/catalogs.js), compartido con onboarding. Antes había mapas
  // divergentes aquí y en los steps del alta.
  const sexoOptions = SEXO_OPTIONS
  const enfoqueOptions = ENFOQUE_OPTIONS
  const horarioOptions = HORARIO_OPTIONS
  const objetivosOptions = OBJETIVO_OPTIONS

  // Listas para suplementación y alimentos (simuladas por ahora)
  const suplementacionList = userProfile.suplementacion || []
  const alimentosList = userProfile.alimentos_excluidos || []

  const suplementacionObjList = suplementacionList.map(item => ({ name: item }))
  const alimentosObjList = alimentosList.map(item => ({ name: item }))

  // Listas para HealthTab
  const alergiasList = userProfile.alergias || []
  const medicamentosList = userProfile.medicamentos || []
  // F1 (ONB-P1-01): limitaciones_fisicas es el campo canónico que edita Salud. La API
  // lo devuelve como array; si llegara como string legacy lo partimos para la lista.
  const rawLimitaciones = userProfile.limitaciones_fisicas
  const limitacionesList = Array.isArray(rawLimitaciones)
    ? rawLimitaciones
    : (rawLimitaciones ? String(rawLimitaciones).split(/\s*[.,;\n]\s*/).map(s => s.trim()).filter(Boolean) : [])
  // Cosmético (arrastrado de F1): negaciones obvias como "Ninguna"/"no" no deben
  // MOSTRARSE como si fueran limitaciones reales. Se filtran SOLO para la vista
  // (el edit y la persistencia usan la lista sin filtrar). Solo tokens de una palabra:
  // un texto como "no puedo flexionar" es información real y NO se filtra.
  const NEGACIONES = new Set(['ninguna', 'ninguno', 'no', 'nada', 'n/a', 'na', '-'])
  const esNegacion = (item) => NEGACIONES.has(String(item || '').trim().toLowerCase())
  const limitacionesDisplayList = limitacionesList.filter(item => !esNegacion(item))
  // `lesiones` queda como alias de lectura legacy (ya no se edita en la UI).
  const lesionesList = userProfile.lesiones || []

  const alergiasObjList = alergiasList.map(item => ({ name: item }))
  const medicamentosObjList = medicamentosList.map(item => ({ name: item }))
  const limitacionesObjList = limitacionesList.map(item => ({ name: item }))
  const limitacionesDisplayObjList = limitacionesDisplayList.map(item => ({ name: item }))
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

  // ONB-P1-03: antes se pintaba el cambio en la UI ANTES de llamar a la API y el
  // editor se cerraba pase lo que pase. Si el PUT fallaba —o si no había sesión, que
  // salía por un `return` mudo sin llegar a pedir nada— el usuario veía su dato como
  // guardado y la caché lo persistía, cuando en Supabase no había cambiado nada.
  // Ahora sólo se confirma tras un 200: si falla, el editor sigue abierto con los
  // valores escritos y el error se muestra.
  const handleSave = async () => {
    if (!editingSection) return

    const normalizedData = normalizeBodyCompositionFields(editedData)
    setIsSaving(true)

    try {
      const { token, userId } = getAuthSession()
      if (!token || !userId) {
        await alertDialog({
          title: 'Sesión caducada',
          description: 'No hemos podido guardar los cambios porque tu sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.'
        })
        return
      }

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
        const detail = await resp.text()
        console.error('Error guardando perfil:', detail)
        await alertDialog({
          title: 'No se pudo guardar',
          description: 'Tus cambios no se han guardado. Revisa tu conexión e inténtalo de nuevo.'
        })
        return
      }

      const data = await resp.json()
      if (data?.user) {
        const ui = mapDbToUi(data.user)
        setUserProfile(ui)
        writeProfileCache(ui)
      } else {
        // El servidor confirmó, pero no devolvió el usuario: aplicamos lo enviado.
        setUserProfile(prev => ({ ...prev, ...normalizedData }))
      }

      setEditingSection(null)
      setEditedData({})
    } catch (e) {
      console.error('Error en handleSave:', e)
      await alertDialog({
        title: 'No se pudo guardar',
        description: 'Tus cambios no se han guardado. Revisa tu conexión e inténtalo de nuevo.'
      })
    } finally {
      setIsSaving(false)
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
        writeProfileCache(ui)
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
        writeProfileCache(ui)
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
    isSaving,
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
    limitacionesList,
    limitacionesDisplayList,
    lesionesList,
    alergiasObjList,
    medicamentosObjList,
    limitacionesObjList,
    limitacionesDisplayObjList,
    lesionesObjList,
    docs,
    fetchDocs,
    setDocsOpen,
    fileInputRef,
    handlePdfUpload
  }
}
