# Sistema de Gestión de Sesiones de Entrenamiento

## Resumen

Este documento describe el sistema de gestión de sesiones de entrenamiento, especialmente enfocado en **HipertrofiaV2**, que resuelve los problemas de sesiones "zombie" (sesiones que quedan activas cuando el usuario cierra la app sin completarlas).

## Problema Resuelto

### Síntomas Anteriores

- Sesiones quedaban en estado `in_progress` indefinidamente
- Planes `draft` se acumulaban sin confirmar
- Al generar nuevos entrenamientos, las sesiones antiguas causaban conflictos
- El usuario veía entrenamientos "activos" que no correspondían

### Solución Implementada

1. **Máquina de Estados**: Transiciones formales y validadas
2. **Limpieza Automática**: Job que cancela sesiones huérfanas
3. **Limpieza Pre-Sesión**: Antes de cada generación de entrenamiento

---

## Arquitectura

### Archivos Principales

```
backend/
├── services/
│   ├── sessionStateConstants.js      # Constantes de estado (sin deps de BD)
│   ├── sessionStateMachine.js        # Máquina de estados formal
│   ├── sessionStatusService.js       # Servicio centralizado de estado
│   └── sessionCleanupService.js      # Limpieza de sesiones huérfanas
├── utils/
│   └── sessionCleanup.js             # Utilidades de limpieza
├── jobs/
│   └── sessionCleanupJob.js          # Job programado de limpieza
├── routes/
│   ├── trainingSession.js            # Endpoints de sesiones
│   └── hipertrofiaV2.js              # Endpoints de HipertrofiaV2
└── tests/
    └── sessionStateMachine.test.js   # Tests de la máquina de estados
```

---

## Estados de Sesión

```
┌─────────┐
│ pending │──────────────────────────────────┐
└────┬────┘                                  │
     │ START                                 │ CANCEL
     ▼                                       │
┌─────────────┐                              │
│ in_progress │──────────────────────────────┤
└──────┬──────┘                              │
       │                                     │
 ┌─────┴─────┬──────────────┐                │
 │           │              │                │
 ▼           ▼              ▼                ▼
completed   partial      skipped         cancelled
             │
             │ TIMEOUT
             ▼
         abandoned
```

### Descripción de Estados

| Estado        | Descripción                           |
| ------------- | ------------------------------------- |
| `pending`     | Sesión creada, esperando inicio       |
| `in_progress` | Usuario está entrenando               |
| `completed`   | Todos los ejercicios completados      |
| `partial`     | Algunos ejercicios completados        |
| `skipped`     | Sesión saltada completamente          |
| `cancelled`   | Sesión cancelada por usuario          |
| `abandoned`   | Sesión abandonada (timeout)           |
| `incomplete`  | Finalizada sin ejercicios completados |

### Estados Terminales

Una vez en estos estados, no hay transiciones posibles:

- `completed`
- `partial`
- `skipped`
- `cancelled`
- `abandoned`
- `incomplete`

---

## Transiciones Válidas

```javascript
const VALID_TRANSITIONS = {
  pending: ["in_progress", "cancelled", "skipped", "abandoned"],
  in_progress: [
    "completed",
    "partial",
    "skipped",
    "cancelled",
    "abandoned",
    "incomplete",
  ],
  // Estados terminales - sin transiciones
  completed: [],
  partial: [],
  skipped: [],
  cancelled: [],
  abandoned: [],
  incomplete: [],
};
```

---

## Acciones

```javascript
const SESSION_ACTIONS = {
  START: "start", // Iniciar sesión
  COMPLETE_EXERCISE: "complete_exercise",
  SKIP_EXERCISE: "skip_exercise",
  CANCEL_EXERCISE: "cancel_exercise",
  FINISH: "finish", // Finalizar sesión
  CANCEL: "cancel", // Cancelar sesión
  ABANDON: "abandon", // Abandonar manualmente
  TIMEOUT: "timeout", // Timeout automático
};
```

---

## Uso

### Iniciar Sesión

```javascript
import {
  transition,
  SESSION_ACTIONS,
} from "../services/sessionStateMachine.js";

const result = transition("pending", SESSION_ACTIONS.START);
// result: { success: true, newState: 'in_progress', previousState: 'pending' }
```

### Finalizar Sesión

```javascript
const context = {
  metrics: { total: 5, completed: 4, skipped: 1, cancelled: 0 },
};
const result = transition("in_progress", SESSION_ACTIONS.FINISH, context);
// result: { success: true, newState: 'partial', previousState: 'in_progress' }
```

### Validar Transición

```javascript
import { isValidTransition } from "../services/sessionStateMachine.js";

isValidTransition("pending", "in_progress"); // true
isValidTransition("pending", "completed"); // false
```

---

## Limpieza Automática

### Configuración

```javascript
// En sessionCleanupService.js
const STALE_SESSION_HOURS = 6; // Sesiones in_progress → cancelled
const DRAFT_PLAN_HOURS = 1; // Drafts → eliminados
const ABANDONED_SESSION_HOURS = 24; // Sesiones muy viejas → abandoned
```

### Job Programado

El job se ejecuta automáticamente al iniciar el servidor:

```javascript
// En server.js
import { startCleanupScheduler } from "./jobs/sessionCleanupJob.js";
startCleanupScheduler(60); // Cada 60 minutos
```

### Limpieza Manual (Endpoint)

```bash
POST /api/training-session/cleanup-stale
Authorization: Bearer <token>
```

---

## Integración en HipertrofiaV2

### Pre-Limpieza en Generación

Antes de generar cualquier plan, se ejecuta limpieza:

```javascript
// En hipertrofiaV2.js
router.post("/generate-d1d5", authenticateToken, async (req, res) => {
  const cleanupResult = await cleanupUserStaleSessions(userId);
  if (cleanupResult.cleaned > 0) {
    logger.info(`🧹 Pre-limpieza: ${cleanupResult.cleaned} sesiones limpiadas`);
  }
  // ... generar plan
});
```

### Pre-Limpieza en Inicio de Sesión

```javascript
// En trainingSession.js
router.post("/start/methodology", authenticateToken, async (req, res) => {
  const { preSessionCleanup } = await import("../utils/sessionCleanup.js");
  const cleanupResult = await preSessionCleanup(userId, methodology_plan_id);
  // ... iniciar sesión
});
```

---

## Endpoints Relacionados

### Sesiones de Entrenamiento

| Método | Endpoint                                                | Descripción                   |
| ------ | ------------------------------------------------------- | ----------------------------- |
| POST   | `/api/training-session/start/methodology`               | Iniciar sesión de metodología |
| POST   | `/api/training-session/complete/methodology/:sessionId` | Finalizar sesión              |
| PUT    | `/api/training-session/close-active`                    | Cerrar sesiones activas       |
| POST   | `/api/training-session/cleanup-stale`                   | Limpiar sesiones huérfanas    |
| GET    | `/api/training-session/pending-sessions`                | Ver sesiones pendientes       |

### HipertrofiaV2

| Método | Endpoint                                 | Descripción              |
| ------ | ---------------------------------------- | ------------------------ |
| POST   | `/api/hipertrofiav2/generate-d1d5`       | Generar plan D1-D5       |
| POST   | `/api/hipertrofiav2/generate-fullbody`   | Generar rutina Full Body |
| POST   | `/api/hipertrofiav2/generate-single-day` | Generar día único        |

---

## Tests

Ejecutar tests de la máquina de estados:

```bash
node backend/tests/sessionStateMachine.test.js
```

Resultado esperado:

```
🧪 Session State Machine Tests

✅ pending → in_progress es válido (START)
✅ in_progress → completed es válido (FINISH con todos completados)
... (21 tests)

📊 Resultados: 21 passed, 0 failed
✨ Todos los tests pasaron!
```

---

## Troubleshooting

### Sesión queda en `in_progress`

1. **Causa**: Usuario cerró la app sin finalizar
2. **Solución automática**: Job de limpieza la marcará como `cancelled` después de 6 horas
3. **Solución manual**:
   ```bash
   POST /api/training-session/cleanup-stale
   ```

### Plan queda en `draft`

1. **Causa**: Error durante generación o usuario abandonó
2. **Solución automática**: Se elimina después de 1 hora
3. **Solución manual**: Se limpia automáticamente al generar nuevo plan

### Conflicto al iniciar nueva sesión

1. **Causa**: Sesión anterior activa
2. **Solución**: `preSessionCleanup` se ejecuta automáticamente
3. **Mensaje de error**: "Ya existe una sesión activa para este día"

---

## Mejoras Futuras

1. **Notificación push**: Avisar al usuario de sesiones abandonadas
2. **Métricas**: Dashboard de sesiones completadas vs abandonadas
3. **Recuperación**: Opción de retomar sesión abandonada
4. **Offline**: Sincronización cuando recupera conexión

---

## Archivos Modificados

### Fase 1 - Limpieza

- `backend/services/sessionCleanupService.js` - Servicio de limpieza
- `backend/utils/sessionCleanup.js` - Utilidades de limpieza
- `backend/jobs/sessionCleanupJob.js` - Job programado

### Fase 2 - Máquina de Estados

- `backend/services/sessionStateConstants.js` - Constantes sin deps BD
- `backend/services/sessionStateMachine.js` - Máquina de estados
- `backend/services/sessionStatusService.js` - Servicio centralizado

### Fase 3 - Integración

- `backend/routes/trainingSession.js` - Integración con máquina de estados
- `backend/routes/hipertrofiaV2.js` - Pre-limpieza en generación
- `backend/tests/sessionStateMachine.test.js` - Tests unitarios

### Archivos Eliminados (Legacy)

- `backend/routes/hipertrofiaV2.legacy.js`
- `backend/routes/hipertrofiaV2.refactored.js`

---

## Autores

Refactorización implementada para resolver problemas de sesiones zombie en HipertrofiaV2.
