# Análisis de Estado y Plan de Migración - RoutineScreen.jsx

## 1. PROBLEMAS IDENTIFICADOS

### 1.1 Gestión Manual de Estado (Líneas 31-40, 55-70)
```javascript
// PROBLEMA: Estado manual de methodologyPlanId
const [methodologyPlanId, setMethodologyPlanId] = useState(() => {
  const fromNavigation = incomingState?.methodology_plan_id;
  if (fromNavigation) {
    localStorage.setItem('currentMethodologyPlanId', String(fromNavigation));
    return fromNavigation;
  }
  const fromStorage = localStorage.getItem('currentMethodologyPlanId');
  return fromStorage ? Number(fromStorage) : null;
});

// PROBLEMA: Gestión compleja de planStartDate
const [planStartDate, setPlanStartDate] = useState(() => {
  const stored = localStorage.getItem('currentRoutinePlanStartDate');
  // ... lógica compleja de validación ...
});
```

### 1.2 No Usa Hooks Extraídos
- **useRoutinePlan.js**: Gestiona plan y persistencia
- **useRoutineSession.js**: Maneja sesiones de entrenamiento
- **useRoutineStats.js**: Estadísticas del plan
- **useRoutineCache.js**: Sistema de caché

### 1.3 Acceso Directo a localStorage
```javascript
// Línea 94: localStorage.getItem('token') directo
// Línea 176: localStorage.setItem('currentMethodologyPlanId', ...)
// Línea 184: localStorage.setItem('currentRoutinePlanStartDate', ...)
```

### 1.4 Lógica Duplicada Identificada

#### En useRoutinePlan.js ya existe:
- Gestión de routinePlan desde navegación (líneas 39-53)
- Persistencia en localStorage (líneas 52, 74)
- Estado de carga y errores (líneas 7-11)

#### En useRoutineSession.js ya existe:
- Gestión de routineSessionId (línea 8)
- Creación y persistencia de sesiones (líneas 92-128)
- Estado de training en progreso (línea 13)

#### En useRoutineCache.js ya existe:
- Sistema de caché para planes activos (CACHE_KEYS.ACTIVE_PLAN)
- Invalidación de caché (línea 331)

## 2. MAPA DE MIGRACIÓN DE ESTADO

### Estados a Migrar:

| Estado Actual | Hook Destino | Función del Hook |
|--------------|--------------|------------------|
| methodologyPlanId | useRoutinePlan | setRoutinePlanId |
| planStartDate | useRoutinePlan (extender) | setPlanStartDate |
| recoveredPlan | useRoutinePlan | routinePlan |
| showPlanModal | Estado local (OK) | - |
| isConfirming | Estado local (OK) | - |
| isCheckingPlanStatus | useRoutinePlan | isLoading |
| isRecoveringPlan | useRoutinePlan | isLoading |
| progressUpdatedAt | useRoutineStats | lastUpdate |

## 3. PLAN DE MIGRACIÓN PASO A PASO

### Fase 1: Extender Hooks Existentes

#### 3.1 Extender useRoutinePlan.js
```javascript
// Agregar gestión de:
- planStartDate y su persistencia
- methodologyPlanId coordinado con routinePlanId
- Recuperación de plan activo usando API
```

#### 3.2 Integrar useRoutineSession.js
```javascript
// Ya maneja:
- routineSessionId
- sessionStartAtMs
- Hidratación de sesiones
```

#### 3.3 Conectar useRoutineStats.js
```javascript
// Para estadísticas y validación de planes archivados
```

### Fase 2: Refactorizar RoutineScreen.jsx

#### 3.4 Importar y usar hooks
```javascript
import useRoutinePlan from '@/hooks/useRoutinePlan';
import useRoutineSession from '@/hooks/useRoutineSession';
import useRoutineStats from '@/hooks/useRoutineStats';
import { useRoutineCache } from '@/hooks/useRoutineCache';
```

#### 3.5 Reemplazar estados manuales
```javascript
const RoutineScreen = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Usar hooks especializados
  const {
    routinePlan,
    routinePlanId,
    methodologyPlanId,
    planStartDate,
    isLoading,
    error,
    checkForActivePlans,
    setPlanStartDate
  } = useRoutinePlan(location);

  const {
    routineSessionId,
    sessionStartAtMs,
    showExerciseModal,
    // ... más estados de sesión
  } = useRoutineSession();

  const {
    routineStats,
    fetchRoutineStats
  } = useRoutineStats(routinePlanId, handleInvalidRoutine);

  const { getOrLoad, invalidateCache } = useRoutineCache();

  // Solo estados locales de UI
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
};
```

### Fase 3: Eliminar Lógica Duplicada

#### 3.6 Eliminar useEffects redundantes
- Líneas 143-250: Recuperación de plan activo (mover a useRoutinePlan)
- Líneas 72-96: Gestión de planStartDate (mover a useRoutinePlan)
- Líneas 109-142: Validación de estado (mantener pero simplificar)

#### 3.7 Simplificar handleStart
```javascript
const handleStart = useCallback(async () => {
  if (isConfirming) return;

  setIsConfirming(true);
  try {
    await confirmRoutinePlan({
      methodology_plan_id: methodologyPlanId,
      routine_plan_id: routinePlanId
    });
    setShowPlanModal(false);
    setActiveTab('today');
  } catch (e) {
    console.error('Error:', e);
    alert(e.message);
  } finally {
    setIsConfirming(false);
  }
}, [isConfirming, methodologyPlanId, routinePlanId]);
```

### Fase 4: Sincronización y Persistencia

#### 3.8 Asegurar persistencia correcta
- methodologyPlanId sincronizado entre hooks
- planStartDate persistente en recargas
- routineSessionId mantenido durante sesión activa
- Estados recuperables después de logout/login

#### 3.9 Implementar listeners de sincronización
```javascript
// En useRoutinePlan
useEffect(() => {
  const handleStorageChange = (e) => {
    if (e.key === 'currentMethodologyPlanId') {
      setMethodologyPlanId(e.newValue);
    }
    if (e.key === 'currentRoutinePlanStartDate') {
      setPlanStartDate(e.newValue);
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

## 4. VERIFICACIÓN DE PERSISTENCIA

### Casos de Prueba Críticos:

1. **Recarga de página**: Todos los estados deben persistir
2. **Navegación entre tabs**: Estados coherentes
3. **Logout/Login**: Recuperación correcta de sesión
4. **Sesión activa**: routineSessionId mantenido
5. **Plan confirmado**: No mostrar modal de confirmación
6. **Cambio de metodología**: Limpiar estados antiguos

## 5. BENEFICIOS DE LA MIGRACIÓN

1. **Separación de responsabilidades**: Cada hook maneja su dominio
2. **Reutilización**: Hooks disponibles para otros componentes
3. **Mantenibilidad**: Lógica centralizada y testeable
4. **Persistencia robusta**: Sistema unificado de gestión de estado
5. **Menos bugs**: Elimina duplicación y estados inconsistentes

## 6. RIESGOS Y MITIGACIÓN

| Riesgo | Mitigación |
|--------|------------|
| Pérdida de datos durante migración | Mantener backup de localStorage |
| Estados inconsistentes | Validación exhaustiva con stateValidator |
| Regresión de funcionalidad | Tests E2E antes de deploy |
| Problemas de sincronización | Event listeners entre pestañas |

## 7. TIMELINE ESTIMADO

- **Fase 1**: 2 horas (extender hooks)
- **Fase 2**: 3 horas (refactorizar componente)
- **Fase 3**: 2 horas (eliminar duplicación)
- **Fase 4**: 2 horas (verificación y testing)
- **Total**: ~9 horas de desarrollo

## 8. CONCLUSIÓN

La arquitectura actual de RoutineScreen.jsx está fragmentada y no aprovecha los hooks especializados ya creados. La migración propuesta:

1. Centraliza la gestión de estado en hooks especializados
2. Elimina ~200 líneas de código duplicado
3. Mejora la persistencia y sincronización
4. Hace el código más mantenible y testeable
5. Reduce la superficie de bugs potenciales

La migración debe hacerse de forma incremental, probando cada fase antes de continuar.