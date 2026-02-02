# Análisis de Implementación: Cálculo de TMB y GCT

**Fecha:** 2026-02-02  
**Rama:** `feature/nutricion-bridge-metabolico`  
**Archivo revisado:** `backend/services/nutritionCalculator.js`

---

## ✅ ASPECTOS CORRECTAMENTE IMPLEMENTADOS

### 1. Ecuaciones de TMB (Líneas 10-30)

#### ✅ Tinsley

```javascript
tinsley({ peso_kg }) {
  return Math.round(24.8 * peso_kg + 10);
}
```

**Documentación:** `TMB = 24.8 × peso + 10` ✓

#### ✅ Twan Ten Haaf

```javascript
tenHaaf({ sexo, peso_kg, altura_cm, edad }) {
  if (sexo === 'hombre') {
    return Math.round(11.936 * peso_kg + 587.728 * (altura_cm / 100) - 8.129 * edad + 191.027 + 29.279);
  }
  return Math.round(11.936 * peso_kg + 587.728 * (altura_cm / 100) - 8.129 * edad + 29.279);
}
```

**Documentación:**

- Hombres: `(11.936 × kg) + (587.728 × altura_m) - (8.129 × edad) + 191.027 + 29.279` ✓
- Mujeres: `(11.936 × kg) + (587.728 × altura_m) - (8.129 × edad) + 29.279` ✓

#### ✅ Mifflin & St Jeor

```javascript
mifflin({ sexo, peso_kg, altura_cm, edad }) {
  const base = 10 * peso_kg + 6.25 * altura_cm - 5 * edad;
  return Math.round(base + (sexo === 'hombre' ? 5 : -161));
}
```

**Documentación:**

- Hombres: `(10 × kg) + (6.25 × altura_cm) - (5 × edad) + 5` ✓
- Mujeres: `(10 × kg) + (6.25 × altura_cm) - (5 × edad) - 161` ✓

#### ✅ Harris & Benedict

```javascript
harris({ sexo, peso_kg, altura_cm, edad }) {
  if (sexo === 'hombre') {
    return Math.round(66.473 + 13.7516 * peso_kg + 5.0033 * altura_cm - 6.755 * edad);
  }
  return Math.round(655.0955 + 9.5634 * peso_kg + 1.8449 * altura_cm - 4.6756 * edad);
}
```

**Documentación:**

- Hombres: `66.473 + (13.7516 × kg) + (5.0033 × altura_cm) - (6.755 × edad)` ✓
- Mujeres: `655.0955 + (9.5634 × kg) + (1.8449 × altura_cm) - (4.6756 × edad)` ✓

---

### 2. Validación de Datos de Entrada (Línea 49)

```javascript
if (
  edad < 14 ||
  edad > 80 ||
  altura_cm < 120 ||
  altura_cm > 220 ||
  peso_kg < 30 ||
  peso_kg > 250
) {
  throw new Error("Datos fuera de rango válido para cálculo TMB");
}
```

**Documentación:**

- ✓ Edad: 14-80
- ✓ Altura: 120-220 cm
- ✓ Peso: 30-250 kg

**Recomendación según documentación:** Si hay % grasa, usar aproximación por cintura/altura (WHtR)

---

### 3. Selección Automática de Ecuación (Líneas 56-92)

#### ✅ Regla 1: Principiante/Sedentario

```javascript
if (levelNormalized === "principiante" || profile.actividad === "sedentario") {
  return BMR_FORMULAS.harris(profile);
}
```

**Documentación:** "Usar Harris & Benedict" ✓

#### ✅ Regla 2: Edad avanzada o altura extrema

```javascript
const alturaExtrema =
  (sexo === "hombre" && (altura_cm >= 190 || altura_cm <= 160)) ||
  (sexo === "mujer" && (altura_cm >= 175 || altura_cm <= 150));
if (edad >= 50 || alturaExtrema) {
  return BMR_FORMULAS.mifflin(profile);
}
```

**Documentación:** "Si edad ≥ 50 o altura muy alta/baja → Mifflin & St Jeor" ✓

#### ✅ Regla 3: Intermedio y edad ≤ 40

```javascript
if (levelNormalized === "intermedio" && edad <= 40) {
  return BMR_FORMULAS.tenHaaf(profile);
}
```

**Documentación:** "Usar Twan Ten Haaf" ✓

#### ✅ Regla 4: Avanzado varón sin alta grasa

```javascript
if (
  levelNormalized === "avanzado" &&
  sexo === "hombre" &&
  peso_kg >= 80 &&
  !highFat &&
  (!bodyfat_percent || bodyfat_percent < 18) &&
  (!whtr || whtr < 0.52)
) {
  return BMR_FORMULAS.tinsley(profile);
}
```

**Documentación:** "Si varón, avanzado, peso ≥ 80 kg y % grasa ≤ 18% o WHtR < 0.52 → Tinsley" ✓

#### ✅ Regla 5: Fallback

```javascript
return BMR_FORMULAS.mifflin(profile);
```

**Documentación:** "Si hay conflicto → Mifflin & St Jeor como ecuación generalista" ✓

---

### 4. Factor de Actividad (Líneas 98-104)

```javascript
const ACTIVITY_FACTORS = {
  sedentario: { base: 1.2, byTraining: { 4: 1.3, 5: 1.4, 6: 1.5 } },
  ligero: { base: 1.4, byTraining: { 4: 1.5, 5: 1.6, 6: 1.7 } },
  moderado: { base: 1.55, byTraining: { 4: 1.7, 5: 1.8, 6: 1.9 } },
  activo: { base: 1.6, byTraining: { 4: 1.7, 5: 1.8, 6: 1.9 } },
  muy_activo: { base: 1.8, byTraining: { 4: 1.9, 5: 2.0, 6: 2.1 } },
};
```

**Documentación (Factor de Actividad):**

- Sedentario (trabajo oficina) + 4 entrenos: 1.3 ✓
- Sedentario (trabajo oficina) + 5 entrenos: 1.4 ✓
- Sedentario (trabajo oficina) + 6 entrenos: 1.5 ✓
- Ligeramente activo + 4 entrenos: 1.5 ✓
- Ligeramente activo + 5 entrenos: 1.6 ✓
- Ligeramente activo + 6 entrenos: 1.7 ✓
- Activo (escaleras, caminar rápido) + 4 entrenos: 1.7 ✓
- Activo (escaleras, caminar rápido) + 5 entrenos: 1.8 ✓
- Activo (escaleras, caminar rápido) + 6 entrenos: 1.9 ✓
- Muy activo (carga/descarga, construcción) + 4 entrenos: 1.9 ✓
- Muy activo (carga/descarga, construcción) + 5 entrenos: 2.0 ✓
- Muy activo (carga/descarga, construcción) + 6 entrenos: 2.1 ✓

---

### 5. Ajuste por Pasos (NEAT) (Líneas 132-140)

```javascript
if (stepsPerDay) {
  if (stepsPerDay < 5000) {
    factor = Math.max(1.2, factor - 0.05);
  } else if (stepsPerDay >= 7500 && stepsPerDay <= 10000) {
    factor = factor + 0.05;
  } else if (stepsPerDay > 10000) {
    factor = Math.min(2.2, factor + 0.1);
  }
}
```

**Documentación (Ajuste por pasos pequeños - NEAT):**

- < 5.000 pasos/día: -0.05 al factor (mínimo 1.2) ✓
- 5.000-7.500 pasos/día: sin cambios ✓
- 7.500-10.000 pasos/día: +0.05 ✓
- > 10.000 pasos/día: +0.10 (máximo 2.2) ✓

---

### 6. Cálculo del GCT (TDEE) (Línea 142)

```javascript
return Math.round(bmr * factor);
```

**Documentación:** `GCT = TMB × Factor de Actividad` ✓

---

## ⚠️ MEJORAS RECOMENDADAS SEGÚN DOCUMENTACIÓN

### 1. **Medición Sospechosa de Cintura**

**Documentación (imagen 3):**

> "Medición sospechosa: si la cintura cambia > 2.5 cm en 7 días sin cambio de peso coherente, pedir repetir medida antes de ajustar."

**Estado actual:** ❌ NO IMPLEMENTADO

**Propuesta de implementación:**

- Crear función de validación de medición de cintura
- Almacenar histórico de mediciones
- Alertar cuando hay cambio > 2.5 cm en 7 días sin cambio proporcional de peso

---

### 2. **Ajuste Dietético según Objetivo**

**Documentación (imagen 4):**

> "Una vez determinado el GCT, se establece el objetivo calórico según la fase. MindFeed debe aplicar rangos seguros y evitar cambios grandes de golpe."

**Recomendaciones documentadas:**

- **Déficit calórico:** pérdida de grasa. Recomendación general: -10% a -20% del GCT (más cerca de -10% si % graso bajo o usuario avanzado).
- **Normocalórica:** mantenimiento del peso corporal. Objetivo = GCT.
- **Superávit calórico:** ganancia de masa muscular. Recomendación general: +5% a +12% del GCT (más cerca de +5% si usuario avanzado).

**Estado actual en código (líneas 151-162):**

```javascript
case 'cut':
  return Math.round(tdee * 0.85); // -15% ✓ (dentro del rango -10% a -20%)
case 'bulk':
  return Math.round(tdee * 1.08); // +8% ✓ (dentro del rango +5% a +12%)
case 'mant':
default:
  return tdee; // ✓ Normocalórica = GCT
```

**✅ IMPLEMENTACIÓN CORRECTA** - Los valores fijos están dentro de los rangos recomendados.

**Mejora opcional:**

- Ajustar porcentaje dinámicamente según nivel de experiencia y % grasa corporal
- Usuario avanzado + bajo % grasa → usar extremos conservadores (-10% cut, +5% bulk)

---

### 3. **Calibración y Reevaluación (cada 14 días)**

**Documentación (imagen 1):**

> "El GCT es una estimación. MindFeed debe recalibrar con datos reales, pero sin reaccionar a una sola semana (ruido por agua/glucógeno)."
>
> **Regla anti-ruido:** usar media de peso de 7 días y exigir 2 semanas consecutivas antes de cambios importantes.
>
> **Ajustes por pasos pequeños:** cambiar 150-250 kcal/día por iteración (no 600 de golpe).

**Reglas de ajuste por fase:**

- **Normocalórica:** si el peso medio cambia > 0.5% en 14 días, ajustar +/- 150 kcal/día.
- **Déficit:** si la pérdida es < 0.3%/semana durante 2 semanas, bajar 150-250 kcal/día; si es > 1%/semana o cae el rendimiento 2 semanas, subir 150-250 kcal/día o hacer diet break.
- **Superávit:** si la ganancia es < 0.15%/semana durante 2 semanas, subir 150 kcal/día; si es > 0.35%/semana y sube la cintura rápido, bajar 150-250 kcal/día.

**Estado actual:** ❌ NO IMPLEMENTADO (Sistema de calibración y reevaluación automática)

**Propuesta de implementación:**

- Crear función para calcular media de peso de los últimos 7 días
- Crear función para evaluar cambio de peso en periodos de 14 días
- Implementar reglas de ajuste automático por fase
- Integrar con sistema de reevaluación cada 14 días (ya existe en `metabolicProfile.js`)

---

### 4. **Proteínas Estables durante Ajustes Calóricos**

**Documentación (imagen 1):**

> "Proteínas estables: si se ajusta calorías, priorizar tocar hidratos/grasa según el perfil del usuario."

**Estado actual:** Implementado parcialmente en `calculateMacros` (líneas 173-205)

**Mejora propuesta:**

- Asegurar que cuando se ajustan calorías, las proteínas permanecen constantes
- Los ajustes afectan primero a carbohidratos y grasas según perfil metabólico

---

## 📊 RESUMEN EJECUTIVO

| Aspecto                          | Estado       | Notas                                          |
| -------------------------------- | ------------ | ---------------------------------------------- |
| Ecuaciones TMB                   | ✅ CORRECTO  | Las 4 ecuaciones implementadas correctamente   |
| Validación de datos              | ✅ CORRECTO  | Rangos validados                               |
| Selección automática             | ✅ CORRECTO  | 5 reglas implementadas según documentación     |
| Factor de actividad              | ✅ CORRECTO  | Valores coinciden con documentación            |
| Ajuste NEAT (pasos)              | ✅ CORRECTO  | Implementado según especificaciones            |
| Cálculo GCT                      | ✅ CORRECTO  | TMB × Factor de Actividad                      |
| Ajuste por objetivo              | ✅ CORRECTO  | -15% cut, +8% bulk, 0% mant (dentro de rangos) |
| Medición sospechosa cintura      | ❌ PENDIENTE | Falta implementar validación                   |
| Sistema de calibración (14 días) | ❌ PENDIENTE | Falta implementar reevaluación automática      |
| Ajustes por pasos pequeños       | ❌ PENDIENTE | Falta lógica de ajuste gradual (150-250 kcal)  |

---

## 🎯 CONCLUSIÓN

**La implementación actual del cálculo de TMB y GCT es CORRECTA y sigue fielmente la documentación proporcionada.**

Las ecuaciones matemáticas, la selección automática de fórmulas, los factores de actividad y el ajuste NEAT están implementados correctamente.

**Áreas de mejora recomendadas:**

1. Implementar validación de medición sospechosa de cintura
2. Crear sistema de calibración y reevaluación cada 14 días con reglas anti-ruido
3. Implementar ajustes graduales (150-250 kcal) en lugar de recalcular desde cero
4. Asegurar que las proteínas permanecen estables durante ajustes calóricos

Estas mejoras no afectan la corrección del cálculo base, sino que añaden capas de seguridad y precisión para el ajuste dinámico del plan nutricional a lo largo del tiempo.

---

**Revisado por:** Claude (Asistente IA)  
**Fecha de análisis:** 2026-02-02  
**Versión del código:** feature/nutricion-bridge-metabolico
