# 🚀 ENDPOINTS MINDFEED - FASE 2

## ✅ ENDPOINTS IMPLEMENTADOS (9 NUEVOS)

Todos los endpoints están en `/backend/routes/hipertrofiaV2.js`

---

## 🩺 **MÓDULO 1: FLAGS DE FATIGA** (5 endpoints)

### `POST /api/hipertrofiav2/submit-fatigue-report`

**Descripción**: Usuario reporta subjetivamente su estado de recuperación

**Headers**:

```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Body**:

```json
{
  "sleep_quality": 7, // 1-10 (10 = excelente)
  "energy_level": 8, // 1-10 (10 = muy energético)
  "doms_level": 3, // 0-10 (0 = sin dolor, 10 = muy dolorido)
  "joint_pain_level": 0, // 0-10 (0 = sin dolor, 10 = dolor intenso)
  "focus_level": 7, // 1-10 (10 = muy concentrado)
  "motivation_level": 8, // 1-10 (10 = muy motivado)
  "notes": "Me siento bien hoy" // Opcional
}
```

**Response**:

```json
{
  "success": true,
  "flag_created": true,
  "flag": {
    "id": 1,
    "flag_type": "light", // light | critical | cognitive
    "flag_date": "2025-11-12T10:30:00Z"
  }
}
```

**Umbrales de Detección**:

- **CRÍTICO**: `joint_pain_level >= 6` O `sleep_quality <= 3` O `energy_level <= 3`
- **LEVE**: `sleep_quality 4-5` O `energy_level 4-5` O `doms_level >= 6`
- **COGNITIVO**: `focus_level <= 4` O `motivation_level <= 4`

---

### `GET /api/hipertrofiav2/fatigue-status/:userId`

**Descripción**: Obtiene resumen de flags recientes y acción recomendada

**Params**:

- `userId` (int) - ID del usuario

**Response**:

```json
{
  "success": true,
  "flags": {
    "light": 1,
    "critical": 0,
    "cognitive": 0,
    "window_days": 10,
    "total": 1
  },
  "evaluation": {
    "action": "freeze_progression",
    "load_adjustment": 0,
    "volume_adjustment": 0,
    "progression_blocked": true,
    "flags": {...},
    "message": "Mantener cargas actuales, no aplicar progresión"
  }
}
```

**Acciones Posibles**:

- `continue_normal` - Sin fatiga detectada
- `freeze_progression` - 1 flag leve → bloquear progresión
- `recovery_microcycle` - ≥1 crítico O ≥2 leves → reducir -6%
- `immediate_deload` - ≥2 críticos → reducir -30% carga, -50% volumen

---

### `POST /api/hipertrofiav2/apply-fatigue-adjustments`

**Descripción**: Aplica ajustes de carga según flags detectados

**Body**:

```json
{
  "methodologyPlanId": 123
}
```

**Response**:

```json
{
  "success": true,
  "fatigue_evaluation": {
    "action": "recovery_microcycle",
    "load_adjustment": -0.06,
    ...
  },
  "adjustments_applied": true,
  "exercises_updated": 15
}
```

---

### `POST /api/hipertrofiav2/detect-auto-fatigue`

**Descripción**: Detecta automáticamente flags desde RIR de sesión (llamar al finalizar sesión)

**Body**:

```json
{
  "sessionId": 456
}
```

**Response**:

```json
{
  "success": true,
  "flag_detected": true,
  "flag_type": "light",
  "mean_rir": 2.3,
  "underperformed_sets": 2,
  "performance_drop_pct": 0
}
```

**Lógica de Detección**:

- **CRÍTICO**: `≥3 series con RIR <2` O `mean_RIR <1.5`
- **LEVE**: `≥2 series con RIR <2` O `mean_RIR <2.5`

---

### `GET /api/hipertrofiav2/fatigue-history/:userId`

**Descripción**: Historial completo de flags del usuario

**Params**:

- `userId` (int) - ID del usuario

**Query**:

- `limit` (int) - Máximo de registros (default: 20)

**Response**:

```json
{
  "success": true,
  "history": [
    {
      "id": 1,
      "flag_date": "2025-11-12T10:00:00Z",
      "flag_type": "light",
      "sleep_quality": 5,
      "energy_level": 5,
      "doms_level": 6,
      "joint_pain_level": 0,
      "mean_rir_session": 2.3,
      "underperformed_sets": 2,
      "auto_detected": false,
      "notes": "Me siento cansado"
    },
    ...
  ],
  "total": 5
}
```

---

## 🧠 **MÓDULO 3: SOLAPAMIENTO NEURAL** (1 endpoint)

### `POST /api/hipertrofiav2/check-neural-overlap`

**Descripción**: Detecta solapamiento neural entre última sesión y sesión actual

**Body**:

```json
{
  "sessionPatterns": [
    "empuje_horizontal",
    "traccion_vertical",
    "aislamiento_triceps"
  ]
}
```

**Patrones Válidos**:

- `empuje_horizontal` - Press banca, press con mancuernas
- `empuje_vertical` - Press militar, press Arnold
- `traccion_horizontal` - Remo, remo con mancuerna
- `traccion_vertical` - Dominadas, jalones
- `bisagra_cadera` - Peso muerto, buenos días
- `cadena_posterior` - Curl femoral, hiperextensiones
- `aislamiento_triceps` - Extensiones, fondos
- `aislamiento_biceps` - Curls, predicador
- `cuadriceps_dominante` - Sentadilla, prensa
- `core_estabilidad` - Planchas, dead bugs

**Response**:

```json
{
  "success": true,
  "overlap": "partial", // none | partial | high
  "adjustment": -0.025, // Ajuste sugerido (-2.5%)
  "hours_since_last": 36,
  "message": "Solapamiento parcial: reducir cargas ~2.5%"
}
```

**Lógica**:

- **ALTO** (`-5%`): Patrones idénticos en sesiones consecutivas (<72h)
- **PARCIAL** (`-2.5%`): Sinergistas detectados (ej: empuje_vertical + empuje_horizontal)
- **NINGUNO** (`0%`): >72h desde última sesión O sin patrones comunes

**Ejemplos de Sinergistas** (overlap parcial):

- `empuje_vertical` ↔ `empuje_horizontal`
- `traccion_vertical` ↔ `traccion_horizontal`
- `bisagra_cadera` ↔ `cadena_posterior`

---

## 🎯 **MÓDULO 4: PRIORIDAD MUSCULAR** (3 endpoints)

### `POST /api/hipertrofiav2/activate-priority`

**Descripción**: Activa prioridad para 1 grupo muscular

**Body**:

```json
{
  "muscleGroup": "Pecho"
}
```

**Grupos Válidos**:

- `Pecho`
- `Espalda`
- `Piernas`
- `Hombros`
- `Bíceps`
- `Tríceps`
- `Core`

**Response**:

```json
{
  "success": true,
  "priority_muscle": "Pecho"
}
```

**Errores**:

```json
{
  "success": false,
  "error": "Ya hay una prioridad activa"
}
```

**Reglas**:

- Solo 1 prioridad activa a la vez
- Duración: 2-3 microciclos completados
- Timeout: >6 semanas sin cerrar microciclo → desactivación automática
- Beneficios: +20% volumen, +1 top set/semana

---

### `POST /api/hipertrofiav2/deactivate-priority`

**Descripción**: Desactiva prioridad muscular manualmente

**Body**: `{}` (vacío)

**Response**:

```json
{
  "success": true,
  "reason": "manual"
}
```

**Razones de Desactivación**:

- `manual` - Usuario desactiva manualmente
- `completed` - Completó 2-3 microciclos
- `timeout` - >6 semanas sin progresar
- `inactivity` - >14 días sin entrenar

---

### `GET /api/hipertrofiav2/priority-status/:userId`

**Descripción**: Estado actual de prioridad muscular

**Params**:

- `userId` (int) - ID del usuario

**Response (con prioridad activa)**:

```json
{
  "success": true,
  "priority": {
    "priority_muscle": "Pecho",
    "priority_started_at": "2025-11-01T10:00:00Z",
    "priority_microcycles_completed": 1,
    "priority_top_sets_this_week": 0
  },
  "timeout_check": {
    "deactivated": false
  }
}
```

**Response (sin prioridad)**:

```json
{
  "success": true,
  "priority": null,
  "timeout_check": {
    "deactivated": false,
    "reason": "no_priority"
  }
}
```

---

## 📊 **INTEGRACIÓN CON FASE 1**

### Modificaciones en `POST /api/hipertrofiav2/advance-cycle`

El endpoint existente ahora acepta un parámetro adicional:

**Body (actualizado)**:

```json
{
  "sessionDayName": "D2",
  "sessionPatterns": [
    // NUEVO (MÓDULO 3)
    "traccion_vertical",
    "aislamiento_biceps"
  ]
}
```

**Response (actualizada)**:

```json
{
  "success": true,
  "cycle_day": 3,
  "microcycles_completed": 0,
  "microcycle_completed": false,
  "message": "Avanzaste a D3",
  "progression": null,
  "fatigue_check": {                // NUEVO (MÓDULO 1)
    "action": "continue_normal",
    "progression_blocked": false
  },
  "inactivity_check": {             // NUEVO (MÓDULO 2)
    "calibration_needed": false,
    "days_inactive": 2
  },
  "session_patterns_saved": [...]   // NUEVO (MÓDULO 3)
}
```

---

## 🔗 **FLUJO COMPLETO: FINALIZAR SESIÓN**

### Secuencia recomendada al completar una sesión:

```javascript
// 1. Detectar fatiga automática (opcional)
POST /api/hipertrofiav2/detect-auto-fatigue
Body: { sessionId: 456 }

// 2. Usuario reporta estado (opcional)
POST /api/hipertrofiav2/submit-fatigue-report
Body: { sleep_quality: 7, energy_level: 8, ... }

// 3. Avanzar ciclo con patrones de solapamiento
POST /api/hipertrofiav2/advance-cycle
Body: {
  sessionDayName: "D2",
  sessionPatterns: ["traccion_vertical", "aislamiento_biceps"]
}

// 4. Verificar si se detectó solapamiento (opcional)
POST /api/hipertrofiav2/check-neural-overlap
Body: { sessionPatterns: ["traccion_vertical", ...] }

// 5. Obtener estado actualizado
GET /api/hipertrofiav2/cycle-status/:userId
```

---

## 🧪 **TESTING CON CURL**

### Ejemplo completo de testing:

```bash
# 1. Reportar fatiga
curl -X POST http://localhost:3010/api/hipertrofiav2/submit-fatigue-report \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sleep_quality": 4,
    "energy_level": 3,
    "doms_level": 7,
    "joint_pain_level": 2,
    "focus_level": 6,
    "motivation_level": 5
  }'

# 2. Verificar estado de fatiga
curl -X GET http://localhost:3010/api/hipertrofiav2/fatigue-status/1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Activar prioridad muscular
curl -X POST http://localhost:3010/api/hipertrofiav2/activate-priority \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"muscleGroup": "Pecho"}'

# 4. Verificar solapamiento
curl -X POST http://localhost:3010/api/hipertrofiav2/check-neural-overlap \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionPatterns": ["empuje_horizontal", "traccion_vertical"]}'

# 5. Avanzar ciclo con patrones
curl -X POST http://localhost:3010/api/hipertrofiav2/advance-cycle \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionDayName": "D2",
    "sessionPatterns": ["traccion_vertical", "aislamiento_biceps"]
  }'
```

---

## 📝 **LOGS DE DEBUGGING**

Todos los endpoints incluyen logs detallados:

```javascript
// Fatigue
🩺 [FATIGUE] Usuario 1 reporta estado de fatiga
🚨 [FATIGUE] Flag reportado: tipo=light, id=1
🔍 [FATIGUE] Obteniendo estado de fatiga para usuario 1
📊 [FATIGUE] Estado: {"light":1,"critical":0}, Acción: freeze_progression

// Overlap
🧠 [OVERLAP] Detectando solapamiento neural para usuario 1
🚨 [OVERLAP] Solapamiento PARCIAL detectado: -2.5%

// Priority
🎯 [PRIORITY] Activando prioridad para Pecho en usuario 1
✅ [PRIORITY] Prioridad activada exitosamente
```

---

## ⚠️ **NOTAS IMPORTANTES**

1. **Todos los endpoints requieren autenticación** con token JWT
2. **Los IDs de usuario** se extraen automáticamente del token (excepto endpoints GET con `:userId`)
3. **Orden de ejecución**: Primero ejecutar migraciones SQL, luego usar endpoints
4. **Validación**: El backend valida todos los parámetros antes de ejecutar SQL
5. **Idempotencia**: Llamar múltiples veces a `activate-priority` con la misma prioridad activa retorna error

---

**Fecha de Creación**: 2025-11-12
**Versión**: MindFeed v1.0 - FASE 2
**Total Endpoints**: 9 nuevos (5 fatigue + 1 overlap + 3 priority)
