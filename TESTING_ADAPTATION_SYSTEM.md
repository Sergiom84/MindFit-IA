# 🧪 Testing del Sistema de Adaptación - Guía Completa

## Descripción

Este documento proporciona pasos para verificar que el sistema de progresión de adaptación a D1-D5 funciona correctamente en las 3 semanas.

---

## ✅ SETUP: Crear bloque de adaptación para test

### 1. Generar un Bloque de Adaptación

Ejecuta en Postman o curl:

```bash
POST http://localhost:3010/api/adaptation/generate
Authorization: Bearer {token_user}
Content-Type: application/json

{
  "blockType": "full_body",
  "durationWeeks": 3
}
```

**Respuesta esperada:**

```json
{
  "success": true,
  "block": {
    "id": "block_123",
    "blockType": "full_body",
    "durationWeeks": 3,
    "startDate": "2024-12-17",
    "sessionsGenerated": 15
  }
}
```

### 2. Verificar que se creó correctamente en BD

```sql
-- Verificar bloque de adaptación
SELECT id, user_id, block_type, duration_weeks, start_date, status
FROM app.adaptation_blocks
WHERE user_id = 31  -- hiper@bas.com
ORDER BY created_at DESC LIMIT 1;

-- Verificar sesiones generadas
SELECT COUNT(*) as total_sessions
FROM app.methodology_exercise_sessions
WHERE methodology_plan_id IN (
  SELECT methodology_plan_id FROM app.adaptation_blocks
  WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1
);

-- Verificar tabla de tracking (debe estar iniciada)
SELECT week_number, sessions_planned, sessions_completed, adherence_met, rir_met, technique_met, progress_met
FROM app.adaptation_criteria_tracking
WHERE adaptation_block_id IN (
  SELECT id FROM app.adaptation_blocks
  WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1
)
ORDER BY week_number;
```

---

## 🎯 SEMANA 1: Completar 4-5 sesiones

### 1. Acceder a la app como hiper@bas.com

- Ir a **Rutinas** → **Hoy**
- Debe verse:
  - ✅ AdaptationProgressPanel mostrando "Semana 1 de 3"
  - ✅ 4 criterios: Adherencia, RIR Control, Técnica, Progreso
  - ✅ Indicadores de progreso

### 2. Completar sesiones de Semana 1

**Sesión 1:**

- Abre "Comenzar Sesión" → Full Body
- Completa **4-5 ejercicios** con pesos y RIRs
- Ejemplos de datos:
  - Ejercicio 1: 60kg, 10 reps, RIR=3 ✓
  - Ejercicio 2: 40kg, 12 reps, RIR=2 ✓
  - Ejercicio 3: 50kg, 8 reps, RIR=2 ✓
  - Ejercicio 4: 30kg, 15 reps, RIR=3 ✓
- Click "Guardar Serie" para cada ejercicio
- **Importante:** Mantener RIR entre 2-4

**Sesiones 2-4:**

- Repetir el mismo proceso
- **Meta:** Completar 4 sesiones en la semana (lunes-viernes)

### 3. Verificar datos en BD después de Semana 1

```sql
-- Peso inicial (baseline) de Semana 1
SELECT
  week_number,
  sessions_completed,
  initial_average_weight,
  current_average_weight,
  weight_progress_percentage,
  mean_rir,
  technique_flags_count,
  adherence_percentage,
  adherence_met,
  rir_met,
  technique_met,
  progress_met
FROM app.adaptation_criteria_tracking
WHERE adaptation_block_id IN (
  SELECT id FROM app.adaptation_blocks
  WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1
)
AND week_number = 1;

-- Verificar logs de series registrados
SELECT
  COUNT(*) as total_sets,
  ROUND(AVG(weight_used), 2) as avg_weight,
  ROUND(AVG(rir_reported), 2) as avg_rir
FROM app.hypertrophy_set_logs
WHERE user_id = 31
AND created_at::date >= CURRENT_DATE - INTERVAL '7 days';
```

**Resultados esperados para Semana 1:**

- `adherence_met`: TRUE (4/5 sesiones)
- `rir_met`: TRUE (mean RIR ≤4)
- `technique_met`: TRUE (<1 flag)
- `progress_met`: TRUE/FALSE (depende de pesos iniciales - espera la semana 2)

---

## 📈 SEMANA 2: Incrementar cargas

### 1. Completar sesiones con incremento de carga

**Objetivos:**

- Completar 4-5 sesiones
- Incrementar pesos un 5-10% vs Semana 1
- Mantener RIR 2-4

**Ejemplo:**

- Ejercicio 1: 63kg (era 60kg), 10 reps, RIR=3 ✓
- Ejercicio 2: 42kg (era 40kg), 12 reps, RIR=2 ✓
- Ejercicio 3: 53kg (era 50kg), 8 reps, RIR=2 ✓
- Ejercicio 4: 31kg (era 30kg), 15 reps, RIR=3 ✓

### 2. Auto-evaluación automática

Después de completar la última sesión:

- ✅ Debe aparecer modal de evaluación
- ✅ Mostrar estado de los 4 criterios
- Si todos están ✓: "Estás listo para D1-D5"
- Si algunos ✗: "Continúa entrenando"

### 3. Verificar BD después de Semana 2

```sql
SELECT
  week_number,
  sessions_completed,
  initial_average_weight,
  current_average_weight,
  weight_progress_percentage,
  mean_rir,
  adherence_percentage,
  adherence_met,
  rir_met,
  technique_met,
  progress_met,
  (adherence_met AND rir_met AND technique_met AND progress_met) as all_criteria_met
FROM app.adaptation_criteria_tracking
WHERE adaptation_block_id IN (
  SELECT id FROM app.adaptation_blocks
  WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1
)
ORDER BY week_number;
```

**Resultados esperados para Semana 2:**

- `progress_met`: TRUE (≥8% incremento vs Semana 1)
- `all_criteria_met`: TRUE/FALSE (depende del desempeño)

---

## 🎯 SEMANA 3: Fase final

### 1. Completar sesiones finales

**Objetivos:**

- Completar 4 sesiones (la última debe disparar evaluación)
- Mantener cargas o subir 2-3%
- RIR 2-4

### 2. Evaluación automática de fin de bloque

**Después de completar la última sesión:**

- Modal aparece automáticamente
- Muestra resumen de 3 semanas
- **Resultado 1: ✅ Listo para D1-D5**
  - Todos los criterios en ✓
  - Botón: "✨ Avanzar a D1-D5"
  - Click → Transición a metodología D1-D5

- **Resultado 2: ⚠️ Necesita mejorar**
  - Al menos 1 criterio en ✗
  - Botón: "✓ Continuar Entrenando"
  - O botón: "🔄 Repetir Semana"

### 3. Verificar BD final

```sql
-- Vista consolidada de progreso
SELECT * FROM app.adaptation_progress_summary
WHERE user_id = 31 AND status = 'active';

-- Histórico de todas las semanas
SELECT
  week_number,
  sessions_completed,
  adherence_percentage,
  mean_rir,
  weight_progress_percentage,
  (adherence_met AND rir_met AND technique_met AND progress_met) as all_criteria_met
FROM app.adaptation_criteria_tracking
WHERE adaptation_block_id IN (
  SELECT id FROM app.adaptation_blocks
  WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1
)
ORDER BY week_number;

-- Verificar si fue exitosa la transición
SELECT transitioned_to_hipertrophy, transitioned_at
FROM app.adaptation_blocks
WHERE user_id = 31 ORDER BY created_at DESC LIMIT 1;
```

---

## 🧪 TEST CASES

### Caso 1: ✅ Éxito - Transición exitosa

**Condiciones:**

- ✓ Adherencia ≥80% (4/5 sesiones cada semana)
- ✓ RIR medio ≤4 (mantener esfuerzo controlado)
- ✓ <1 flag técnico por semana
- ✓ ≥8% incremento de peso

**Resultado esperado:**

- Modal: "¡Felicitaciones! Estás listo para D1-D5"
- Botón "✨ Avanzar a D1-D5" disponible
- Click → Se transiciona a D1-D5
- `transitioned_to_hipertrophy = TRUE` en BD

### Caso 2: ⚠️ Adherencia baja

**Condiciones:**

- ✗ Adherencia <80% (solo 3/5 sesiones)
- ✓ RIR medio ≤4
- ✓ <1 flag
- ✓ ≥8% incremento

**Resultado esperado:**

- Modal: "Aún hay criterios por cumplir"
- Muestra: "Necesitas aumentar tu adherencia"
- Botón "✓ Continuar Entrenando"
- Puede repetir la semana

### Caso 3: ⚠️ RIR muy bajo

**Condiciones:**

- ✓ Adherencia ≥80%
- ✗ RIR medio >4 (esfuerzo muy alto)
- ✓ <1 flag
- ✓ ≥8% incremento

**Resultado esperado:**

- Modal: "Tu esfuerzo es muy alto. Reduce cargas"
- No permite transición
- Botón para repetir

### Caso 4: ⚠️ Sin progreso de carga

**Condiciones:**

- ✓ Adherencia ≥80%
- ✓ RIR medio ≤4
- ✓ <1 flag
- ✗ <8% incremento (mantuviste pesos)

**Resultado esperado:**

- Modal: "Aumenta gradualmente tus cargas"
- Necesita mejorar progresión
- Opción para repetir

---

## 📱 VERIFICACIÓN EN APP

### AdaptationProgressPanel debe mostrar:

✅ **Header:**

- Semana 1/3 (o 2/3, 3/3 según progreso)
- Barra de progreso visual
- % completado

✅ **4 Criterios con indicadores:**

- Adherencia: 4/5 (80%) ✓
- RIR: 3.2 ≤4 ✓
- Técnica: 0 flags <1 ✓
- Progreso: 8.5% ≥8% ✓

✅ **Sección Estado de Transición:**

- Si todo ✓: "¡Felicitaciones! Cumples todos los criterios"
- Si falta algo: Muestra cuál criterio falta y qué mejorar

✅ **Histórico de Semanas:** (desplegable)

- Semana 1: ✓ Completa
- Semana 2: ○ Parcial
- Semana 3: ○ En progreso

---

## 🔧 DEBUGGING

### Si el panel no aparece:

```javascript
// En consola del navegador
// 1. Verificar que hay bloque activo
fetch("http://localhost:3010/api/adaptation/progress", {
  headers: { Authorization: `Bearer ${token}` },
})
  .then((r) => r.json())
  .then((data) => console.log("Progress:", data));

// 2. Verificar evaluación manual
fetch("http://localhost:3010/api/adaptation/evaluate", {
  headers: { Authorization: `Bearer ${token}` },
})
  .then((r) => r.json())
  .then((data) => console.log("Evaluate:", data));
```

### Si el modal no aparece después de completar:

```javascript
// Disparar evaluación manualmente
fetch("http://localhost:3010/api/adaptation/auto-evaluate-week", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
})
  .then((r) => r.json())
  .then((data) => console.log("Auto-eval:", data));
```

---

## ✅ CHECKLIST FINAL

- [ ] Bloque de adaptación se crea correctamente
- [ ] Sesiones se registran con peso/reps/RIR
- [ ] AdaptationProgressPanel aparece en TodayTrainingTab
- [ ] 4 criterios se calculan correctamente
- [ ] Modal de evaluación aparece después de cada sesión
- [ ] Estado "Listo" muestra botón verde
- [ ] Estado "No listo" muestra botón azul
- [ ] Click en "Avanzar" transiciona a D1-D5
- [ ] Click en "Repetir" genera nueva semana
- [ ] Base de datos refleja todo correctamente
- [ ] Frontend y backend sincronizados

---

## 📞 Contacto para Issues

Si encuentras problemas:

1. Revisa los logs del backend: `npm run dev:backend`
2. Abre DevTools del navegador (F12) → Console
3. Verifica BD directamente con queries SQL
4. Consulta documentación en `Doc_Hpv2/`

---

**Fecha de creación:** 2024-12-17
**Versión del sistema:** 3.1.0
**Usuario de test:** hiper@bas.com (ID: 31)
