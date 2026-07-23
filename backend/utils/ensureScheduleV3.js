const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const DAY_ABBREVS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function formatLocalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stripDiacritics(str = '') {
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return str;
  }
}

export function normalizeDayAbbrev(dayName) {
  if (!dayName) return dayName;

  const raw = stripDiacritics(String(dayName).trim());
  const lower = raw.toLowerCase().replace(/\.$/, '');
  const cleaned = lower.replace(/[^a-z]/g, '');

  if (cleaned.startsWith('lun')) return 'Lun';
  if (cleaned.startsWith('mar')) return 'Mar';
  if (cleaned.startsWith('mie') || cleaned.startsWith('mir') || cleaned.startsWith('mia')) return 'Mie';
  if (cleaned.startsWith('jue')) return 'Jue';
  if (cleaned.startsWith('vie')) return 'Vie';
  if (cleaned.startsWith('sab')) return 'Sab';
  if (cleaned.startsWith('dom')) return 'Dom';

  return dayName;
}


function normalizePlanDays(planDataJson) {
  try {
    if (!planDataJson || !Array.isArray(planDataJson.semanas)) return planDataJson;
    return {
      ...planDataJson,
      semanas: planDataJson.semanas.map(sem => ({
        ...sem,
        sesiones: Array.isArray(sem.sesiones)
          ? sem.sesiones.map(ses => ({
              ...ses,
              dia: normalizeDayAbbrev(ses.dia)
            }))
          : sem.sesiones
      }))
    };
  } catch (error) {
    console.error('normalizePlanDays error:', error);
    return planDataJson;
  }
}

import { adjustWorkoutIntensity, shouldAdjustIntensity } from './adjustWorkoutIntensity.js';
// Nutrición Fase 0 (doc04 PR3, spec §9): persistir day_id y metadata.session_load al
// materializar el calendario. Helper puro (sin efectos) para poder testearlo aislado.
import { buildPlanDayMetadata } from '../services/trainingLoad/sessionLoadBuilder.js';
import { HIPERTROFIA_PERSISTED_TYPE } from '../services/hipertrofia/identity.js';

/**
 * Genera workout_schedule y methodology_plan_days respetando preferencias del usuario.
 * VERSIÓN MEJORADA: Implementa redistribución inteligente según el día de inicio
 *
 * @param {Object} startConfig - Configuración de inicio del usuario (opcional)
 * @param {number} startConfig.sessions_first_week - Número de sesiones en primera semana
 * @param {string} startConfig.distribution_option - 'saturdays' o 'extra_week'
 * @param {boolean} startConfig.include_saturdays - Si incluir sábados en el calendario
 */
export async function ensureWorkoutScheduleV3(client, userId, methodologyPlanId, planDataJson, startDate = new Date(), startConfig = null) {
  let usingSavepoint = false;
  try {
    // Patrón base por defecto (3x semana Lun-Mié-Vie)
    const originalPattern = 'Lun-Mié-Vie';

    console.log('[ensureWorkoutScheduleV3] Iniciando con redistribución inteligente', {
      planId: methodologyPlanId,
      userId,
      startDate: formatLocalDate(startDate),
      hasStartConfig: !!startConfig
    });

    if (startConfig) {
      console.log('🗓️ [ensureWorkoutScheduleV3] Usando configuración del usuario:', {
        sessionsFirstWeek: startConfig.sessions_first_week,
        distributionOption: startConfig.distribution_option,
        includeSaturdays: startConfig.include_saturdays
      });
    }

    const planData = typeof planDataJson === 'string' ? JSON.parse(planDataJson) : planDataJson;
    if (!planData || !Array.isArray(planData.semanas) || planData.semanas.length === 0) {
      console.warn('[ensureWorkoutScheduleV3] Plan vacio o sin semanas', { planId: methodologyPlanId });
      return;
    }

    const normalizedPlan = normalizePlanDays(planData);

    // COR-F0-04 §9: no ocultar errores estructurales del calendario dejando una
    // transacción PostgreSQL abortada. Si el caller nos entrega un cliente dentro de
    // una transacción (BEGIN), un fallo a media materialización dejaría la transacción
    // abortada y el catch de abajo la ocultaría, haciendo fallar en cascada al resto de
    // sentencias del caller. Con un SAVEPOINT aislamos el bloque:
    //  - En transacción: ante error hacemos ROLLBACK TO SAVEPOINT (limpiamos el estado
    //    abortado) y PROPAGAMOS, para que el problema estructural sea visible.
    //  - En auto-commit (todos los callers actuales usan pool.connect() sin BEGIN):
    //    SAVEPOINT no es válido; conservamos el comportamiento no bloqueante previo
    //    (log + no propagar) para no romper los flujos de nutrición (regla §9: los
    //    fallos de nutrición nunca deben impedir completar la sesión).
    try {
      await client.query('SAVEPOINT ensure_schedule_v3');
      usingSavepoint = true;
    } catch {
      usingSavepoint = false;
    }

    await client.query(
      'DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2',
      [methodologyPlanId, userId]
    );
    await client.query(
      'DELETE FROM app.methodology_plan_days WHERE plan_id = $1',
      [methodologyPlanId]
    );
    console.log('[ensureWorkoutScheduleV3] Tablas limpiadas', { planId: methodologyPlanId });

    const planStartDate = new Date(startDate);

    // 🎯 NUEVO: LÓGICA DE REDISTRIBUCIÓN DINÁMICA
    const startDayOfWeek = planStartDate.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const dayName = DAY_NAMES[startDayOfWeek];

    console.log(`📅 [Redistribución Dinámica] Generando plan en ${dayName} (día ${startDayOfWeek})`);

    // Detectar el nivel del usuario (principiante, intermedio, avanzado)
    const userLevel = planData?.nivel || planData?.level || 'principiante';
    const isPrincipiante = userLevel.toLowerCase().includes('princip');

    // Variables de configuración
    let firstWeekPattern = null;
    let isConsecutiveDays = false;
    let isExtendedWeeks = false;
    let intensityAdjusted = false;
    let totalWeeks = planData.semanas.length;
    let warnings = [];
    let dayMappings = {};
    let includeSaturdays = false;

    // 🆕 USAR CONFIGURACIÓN DEL USUARIO SI EXISTE
    if (startConfig) {
      console.log('✅ [Redistribución] Usando configuración del usuario');

      // 🎯 Prioridad 1: Leer first_week_pattern directamente si existe
      if (startConfig.first_week_pattern) {
        firstWeekPattern = startConfig.first_week_pattern;
        console.log(`📊 Primera semana (desde config): ${firstWeekPattern}`);
      } else {
        // Prioridad 2: Calcular patrón según sessionsFirstWeek
        const sessionsFirstWeek = startConfig.sessions_first_week || 0;
        includeSaturdays = startConfig.include_saturdays || false;

        if (sessionsFirstWeek > 0) {
          const daysAvailable = [];
          const maxDay = includeSaturdays ? 6 : 5; // Hasta sábado o viernes

          for (let d = startDayOfWeek; d <= maxDay && daysAvailable.length < sessionsFirstWeek; d++) {
            daysAvailable.push(DAY_ABBREVS[d]);
          }

          firstWeekPattern = daysAvailable.join('-');
          console.log(`📊 Primera semana (calculada): ${sessionsFirstWeek} sesiones → ${firstWeekPattern}`);
        }
      }

      isExtendedWeeks = startConfig.distribution_option === 'extra_week';
      includeSaturdays = startConfig.include_saturdays || false;

      // Ajustar total de semanas si se eligió semana extra
      if (isExtendedWeeks) {
        totalWeeks = planData.semanas.length + 1;
        console.log(`📊 Semana extra añadida: ${totalWeeks} semanas totales`);
      }
    } else {
      console.log('⚠️ [Redistribución] Sin configuración del usuario, usando lógica por defecto');
      // Sin startConfig NO se fuerza patrón: la semana 1 usa los días propios del plan.
      // (Antes se forzaba 'Lun-Mié-Vie' y un plan de 4-5 días/semana perdía sesiones
      // en la semana 1, p.ej. 39/40 programadas.) Los arranques a mitad de semana de
      // principiantes se tratan en el switch de abajo.
      firstWeekPattern = null;
    }

    // 🔄 APLICAR REDISTRIBUCIÓN SEGÚN EL DÍA DE INICIO (SOLO SI NO HAY startConfig)
    if (!startConfig && isPrincipiante) {
      console.log('⚠️ [Redistribución] Usando lógica hardcodeada (fallback)');
      switch (startDayOfWeek) {
        case 1: // LUNES
          // Empezar en lunes no requiere redistribución: la semana 1 mantiene los
          // días propios del plan (sea de 3, 4 o 5 días por semana).
          console.log('✅ Lunes: Patrón estándar sin cambios');
          firstWeekPattern = null;
          break;

        case 2: // MARTES
          console.log('📝 Martes: Mapeando como día 1');
          firstWeekPattern = 'Mar-Mié-Vie';
          dayMappings = {
            'Mar': 'sesion_1',
            'Mié': 'sesion_2',
            'Vie': 'sesion_3'
          };
          warnings.push({
            type: 'info',
            message: 'Tu plan comienza hoy martes. Las sesiones seguirán el patrón Mar-Mié-Vie esta semana.'
          });
          break;

        case 3: // MIÉRCOLES
          console.log('⚡ Miércoles: 3 días consecutivos con ajuste de volumen');
          firstWeekPattern = 'Mié-Jue-Vie';
          isConsecutiveDays = true;
          intensityAdjusted = true;
          dayMappings = {
            'Mié': 'sesion_1',
            'Jue': 'sesion_2',
            'Vie': 'sesion_3'
          };
          warnings.push({
            type: 'warning',
            message: 'Al comenzar miércoles, entrenarás 3 días consecutivos. El volumen se ha ajustado automáticamente para permitir una recuperación adecuada.',
            icon: '⚡'
          });
          break;

        case 4: // JUEVES
          console.log('📊 Jueves: Extendiendo a 5 semanas');
          firstWeekPattern = 'Jue-Vie';
          isExtendedWeeks = true;
          totalWeeks = 5;
          dayMappings = {
            'Jue': 'sesion_1',
            'Vie': 'sesion_2'
          };
          warnings.push({
            type: 'info',
            message: 'Tu plan se extiende a 5 semanas para completar las 12 sesiones, comenzando con Jue-Vie esta semana.'
          });
          break;

        case 5: // VIERNES
          console.log('📊 Viernes: Extendiendo a 5 semanas');
          firstWeekPattern = 'Vie';
          isExtendedWeeks = true;
          totalWeeks = 5;
          dayMappings = {
            'Vie': 'sesion_1'
          };
          warnings.push({
            type: 'info',
            message: 'Tu plan se extiende a 5 semanas para completar las 12 sesiones, comenzando solo con viernes esta semana.'
          });
          break;

        case 6: // SÁBADO
        case 0: // DOMINGO
          console.log('🚨 Fin de semana: Se requiere Full Body especial');

          // Para fines de semana, generar warning y configuración especial
          firstWeekPattern = 'Full Body';
          dayMappings = {
            [dayName]: 'fullbody_session'
          };

          warnings.push({
            type: 'important',
            icon: '💪',
            title: 'Generación en Fin de Semana',
            message: 'Has generado tu plan en fin de semana. Se recomienda una rutina Full Body especial para hoy. El plan regular comenzará el lunes.'
          });

          warnings.push({
            type: 'warning',
            icon: '⚠️',
            title: 'Rutina Alternativa Recomendada',
            message: 'Para el fin de semana, considera generar una rutina Full Body que trabaje todos los grupos musculares en una sesión.'
          });
          break;

        default:
          firstWeekPattern = originalPattern;
      }
    }
    // Nota: para intermedios/avanzados sin startConfig NO se fuerza patrón alguno
    // (antes se imponía 'Lun-Mié-Vie' y los planes de 4-5 días/semana perdían
    // sesiones en la semana 1). Sin patrón, la semana 1 usa los días del plan.

    // Guardar configuración de redistribución en la base de datos
    let configResult = null;
    try {
      console.log('[ensureWorkoutScheduleV3] 📝 Guardando configuración de redistribución...');
      configResult = await client.query(`
        INSERT INTO app.plan_start_config (
          methodology_plan_id,
          user_id,
          start_day_of_week,
          start_date,
          is_consecutive_days,
          intensity_adjusted,
          is_extended_weeks,
          original_pattern,
          first_week_pattern,
          regular_pattern,
          total_weeks,
          expected_sessions,
          day_mappings,
          warnings
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (methodology_plan_id)
        DO UPDATE SET
          start_day_of_week = EXCLUDED.start_day_of_week,
          start_date = EXCLUDED.start_date,
          is_consecutive_days = EXCLUDED.is_consecutive_days,
          intensity_adjusted = EXCLUDED.intensity_adjusted,
          first_week_pattern = EXCLUDED.first_week_pattern,
          day_mappings = EXCLUDED.day_mappings,
          warnings = EXCLUDED.warnings,
          updated_at = NOW()
        RETURNING *
      `, [
        methodologyPlanId,
        userId,
        startDayOfWeek,
        formatLocalDate(planStartDate),
        isConsecutiveDays,
        intensityAdjusted,
        isExtendedWeeks,
        originalPattern,
        firstWeekPattern,
        originalPattern, // regular_pattern (semanas 2+)
        totalWeeks,
        // expected_sessions = frecuencia_por_semana * total_semanas (real del plan).
        // Antes: hardcode 12 para principiante (asunción vieja de plan de 4 semanas);
        // los planes actuales de principiante son 8 sem/24 ses -> mostraba "de 12".
        (Number(planData?.frecuencia_por_semana)
          || planData.semanas?.[0]?.sesiones?.length
          || 3) * totalWeeks, // expected_sessions
        JSON.stringify(dayMappings),
        JSON.stringify(warnings)
      ]);
      console.log('[ensureWorkoutScheduleV3] ✅ Configuración guardada exitosamente');
    } catch (err) {
      console.warn('[ensureWorkoutScheduleV3] ⚠️ No se pudo guardar plan_start_config:', err.message);
      configResult = null;
    }

    const planConfig = configResult?.rows?.[0] || {
      is_consecutive_days: isConsecutiveDays,
      intensity_adjusted: intensityAdjusted,
      first_week_pattern: firstWeekPattern,
      day_mappings: dayMappings
    };

    console.log('📋 Configuración de redistribución:', {
      firstWeekPattern,
      isConsecutiveDays,
      isExtendedWeeks,
      totalWeeks,
      warnings: warnings.length
    });

    let userPrefs = null;
    try {
      const prefsQ = await client.query(
        'SELECT usar_preferencias_ia, dias_preferidos_entrenamiento, ejercicios_por_dia_preferido FROM app.user_profiles WHERE user_id = $1',
        [userId]
      );
      userPrefs = prefsQ.rows?.[0] || null;
    } catch (prefsError) {
      console.warn('[ensureWorkoutScheduleV3] No se pudieron leer preferencias', prefsError?.message || prefsError);
    }

    const preferredAbbrevs = Array.isArray(userPrefs?.dias_preferidos_entrenamiento)
      ? userPrefs.dias_preferidos_entrenamiento.map(d => normalizeDayAbbrev(d)).filter(Boolean)
      : null;
    const usePreferences = Boolean(userPrefs?.usar_preferencias_ia && preferredAbbrevs && preferredAbbrevs.length > 0);
    const limitPerSession = usePreferences && Number(userPrefs?.ejercicios_por_dia_preferido)
      ? Number(userPrefs.ejercicios_por_dia_preferido)
      : null;
    if (limitPerSession) {
      console.log('[ensureWorkoutScheduleV3] Limite ejercicios por sesion', { planId: methodologyPlanId, limitPerSession });
    }

    let dayId = 1;
    let globalSessionOrder = 1;

    // Calcular total esperado de sesiones para compensación en última semana
    const firstWeekSessions = normalizedPlan.semanas[0]?.sesiones?.length || 0;
    // totalWeeks ya fue declarado arriba en el bloque de redistribución (línea 102)
    const totalExpectedSessions = firstWeekSessions * totalWeeks;
    // Ajuste del objetivo: usar frecuencia_por_semana si está disponible
    const __expectedPerWeek = Number(planData?.frecuencia_por_semana) || Math.max(
      ...normalizedPlan.semanas.map(sem => Array.isArray(sem?.sesiones) ? sem.sesiones.length : 0)
    );
    const __fixedTotalExpectedSessions = __expectedPerWeek * totalWeeks;

    for (let weekIndex = 0; weekIndex < normalizedPlan.semanas.length; weekIndex++) {
      const semana = normalizedPlan.semanas[weekIndex];
      const weekNumber = weekIndex + 1;
      const baseSessions = Array.isArray(semana?.sesiones) ? semana.sesiones.filter(Boolean) : [];
      if (baseSessions.length === 0) {
        continue;
      }

      let sessionsToSchedule;

      // 🎯 NUEVO: Aplicar redistribución para la primera semana
      // 🚨 EXCEPCIÓN: Planes D1-D5 (HipertrofiaV2) NO necesitan redistribución,
      // salvo que el usuario haya elegido explícitamente un inicio distinto a lunes.
      const startDowOverride = startConfig?.start_day_of_week;
      const hasExplicitNonMondayStart = Number.isFinite(Number(startDowOverride)) && Number(startDowOverride) !== 1;
      const isD1D5NonRedist = (planData.metodologia === HIPERTROFIA_PERSISTED_TYPE ||
                               (firstWeekPattern && firstWeekPattern.includes('Lun-Mar-Mie-Jue-Vie'))) &&
                               !hasExplicitNonMondayStart;

      if (weekIndex === 0 && firstWeekPattern && !isD1D5NonRedist) {
        // Para la primera semana, usar el patrón redistribuido
        const redistributedDays = firstWeekPattern.split('-').map(d => d.trim());

        console.log(`🔄 [Semana 1] Aplicando redistribución: ${firstWeekPattern}`);

        sessionsToSchedule = [];
        for (let i = 0; i < redistributedDays.length; i++) {
          const targetDay = redistributedDays[i];
          const sourceSession = baseSessions[i % baseSessions.length];

          // Aplicar ajuste de intensidad si es necesario
          let adjustedSession = { ...sourceSession, dia: targetDay };

          if (isConsecutiveDays && intensityAdjusted) {
            const dayInSequence = i + 1;
            const adjustmentResult = adjustWorkoutIntensity(
              sourceSession.ejercicios || [],
              {
                dayInSequence,
                consecutiveDays: 3,
                isFirstWeek: true
              }
            );

            adjustedSession.ejercicios = adjustmentResult.exercises;
            adjustedSession.intensity_metadata = adjustmentResult.metadata;

            console.log(`⚡ Ajustando intensidad para ${targetDay} (día ${dayInSequence} de 3 consecutivos)`);
          }

          sessionsToSchedule.push(adjustedSession);
        }
      } else if (usePreferences) {
        const targetCount = preferredAbbrevs.length;
        sessionsToSchedule = [];
        for (let i = 0; i < targetCount; i++) {
          const source = baseSessions[i % baseSessions.length];
          const assignedDay = preferredAbbrevs[i];
          sessionsToSchedule.push({ ...source, dia: assignedDay, __cloned: i >= baseSessions.length });
        }
        if (baseSessions.length < preferredAbbrevs.length) {
          console.log('[ensureWorkoutScheduleV3] Replicando sesiones para cubrir preferencias', {
            planId: methodologyPlanId,
            weekNumber,
            baseSessions: baseSessions.length,
            preferredDays: preferredAbbrevs
          });
        }
      } else {
        sessionsToSchedule = baseSessions.map(session => ({ ...session }));
      }

      // ✅ MAPEAR D1..D5 a días reales (Lun..Vie o Lun..Sáb) - TODAS LAS SEMANAS
      // En muchos planes MindFeed, las sesiones vienen con etiquetas 'D1'..'D5'.
      // Aquí las traducimos a días fijos para que workout_schedule pueda asignarlas.
      const KNOWN = new Set(DAY_ABBREVS); // Dom..Sab
      const allUnknown = sessionsToSchedule.every(s => !KNOWN.has(normalizeDayAbbrev(s.dia)));

      if (allUnknown && sessionsToSchedule.length > 0) {
        console.log(`🔄 [Redistribución] Mapeando D1-D5 a días reales (semana ${weekIndex + 1})`);

        // 🆕 Seleccionar patrón según número de sesiones/semana Y si incluye sábados
        let targetDays;
        const count = sessionsToSchedule.length;

        if (includeSaturdays) {
          // Patrón con sábados (Lun-Sáb)
          if (count >= 6) {
            targetDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
          } else if (count === 5) {
            targetDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
          } else if (count === 4) {
            targetDays = ['Lun', 'Mar', 'Jue', 'Vie'];
          } else if (count === 3) {
            targetDays = ['Lun', 'Mie', 'Vie'];
          } else if (count === 2) {
            targetDays = ['Lun', 'Jue'];
          } else {
            targetDays = ['Lun'];
          }
        } else {
          // Patrón sin sábados (Lun-Vie)
          if (count >= 5) {
            targetDays = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie'];
          } else if (count === 4) {
            targetDays = ['Lun', 'Mar', 'Jue', 'Vie'];
          } else if (count === 3) {
            targetDays = ['Lun', 'Mie', 'Vie'];
          } else if (count === 2) {
            targetDays = ['Lun', 'Jue'];
          } else {
            targetDays = ['Lun'];
          }
        }

        console.log(`🔄 Mapeando D1-D${count} → ${targetDays.join(', ')}`);

        sessionsToSchedule = sessionsToSchedule.map((session, i) => ({
          ...session,
          dia: targetDays[i % targetDays.length]
        }));
      }

      // 🔧 LÓGICA PARA PRIMERA SEMANA Y ÚLTIMA SEMANA
      const isFirstWeek = weekIndex === 0;
      const isLastWeek = weekIndex === normalizedPlan.semanas.length - 1;
      const startDayOfWeek = planStartDate.getDay(); // 0 = Domingo, 1 = Lun, ..., 5 = Vie, 6 = Sáb

      // 🆕 PRIMERA SEMANA: Verificar que solo tenga las sesiones correctas
      if (isFirstWeek && startConfig && firstWeekPattern) {
        // 🎯 EXCEPCIÓN: No recortar planes D1-D5 (HipertrofiaV2, Oposiciones, etc.)
        const isD1D5Plan = sessionsToSchedule.length >= 5 &&
                           (planData.metodologia === HIPERTROFIA_PERSISTED_TYPE ||
                            planData.metodologia === 'Oposiciones' ||
                            firstWeekPattern.includes('Lun-Mar-Mie-Jue-Vie'));

        if (isD1D5Plan) {
          console.log('🎯 [Primera semana] Plan D1-D5 detectado, manteniendo todas las sesiones:', {
            metodologia: planData.metodologia,
            sesiones: sessionsToSchedule.length,
            pattern: firstWeekPattern
          });
        } else {
          // Si ya se aplicó firstWeekPattern, verificar que solo tenga las sesiones necesarias
          const expectedSessions = firstWeekPattern.split('-').length;
          if (sessionsToSchedule.length > expectedSessions) {
            console.log(`⚠️ [Primera semana] Recortando sesiones: ${sessionsToSchedule.length} → ${expectedSessions}`);
            sessionsToSchedule = sessionsToSchedule.slice(0, expectedSessions);
          }
          console.log('✅ [Primera semana] Usando configuración del usuario:', {
            pattern: firstWeekPattern,
            sessions: sessionsToSchedule.map(s => s.dia)
          });
        }
      } else if (isFirstWeek && !startConfig) {
        // Solo aplicar lógica hardcodeada si NO hay startConfig.
        // Con inicio en LUNES no hay nada que comprimir: la semana 1 usa los días
        // del plan tal cual (antes se reasignaba a días consecutivos Lun-Mar-Mié
        // y un plan de 4 días perdía el viernes).
        console.log('⚠️ [Primera semana] Sin startConfig, usando lógica hardcodeada');

        if (startDayOfWeek > 1 && startDayOfWeek < 6) {
          // Calcular días consecutivos disponibles desde hoy hasta viernes
          const consecutiveDaysAvailable = [];
          for (let d = startDayOfWeek; d <= 5; d++) { // 1=Lun ... 5=Vie
            consecutiveDaysAvailable.push(DAY_ABBREVS[d]);
          }

          const sessionsNeeded = Math.min(sessionsToSchedule.length, consecutiveDaysAvailable.length);

          if (sessionsNeeded > 0) {
            console.log(`[ensureWorkoutScheduleV3] Primera semana: asignando ${sessionsNeeded} sesiones a días consecutivos`, {
              planId: methodologyPlanId,
              díasDisponibles: consecutiveDaysAvailable,
              startDayOfWeek
            });

            // Tomar las primeras N sesiones y asignarlas a días consecutivos
            const redistributedSessions = [];
            for (let i = 0; i < sessionsNeeded; i++) {
              const session = sessionsToSchedule[i];
              const targetDay = consecutiveDaysAvailable[i];
              redistributedSessions.push({ ...session, dia: targetDay });
            }

            sessionsToSchedule = redistributedSessions;

            console.log('[ensureWorkoutScheduleV3] Sesiones asignadas en primera semana:', {
              planId: methodologyPlanId,
              sesionesAsignadas: sessionsToSchedule.map(s => s.dia)
            });
          }
        }
      }

      // ÚLTIMA SEMANA: Compensar déficit de sesiones
      if (isLastWeek && !usePreferences) {
        // Extraer días fijos del nivel desde las sesiones del plan
        const levelFixedDays = [...new Set(
          normalizedPlan.semanas
            .slice(1)
            .flatMap(sem => sem.sesiones || [])
            .map(ses => normalizeDayAbbrev(ses.dia))
            .filter(Boolean)
        )];

        // Calcular cuántas sesiones llevamos programadas hasta ahora (antes de esta semana)
        const sessionsProgrammedSoFar = globalSessionOrder - 1;

        // El déficit es lo que falta para llegar al total esperado
        const deficit = Math.max(0, __fixedTotalExpectedSessions - sessionsProgrammedSoFar);
        // 🎯 FIX (semanas a la deriva): NO inflar la última semana por encima de su
        // frecuencia normal. Al empezar a media semana, la semana 1 queda corta y el
        // déficit hacía que la última semana absorbiera las sesiones que faltaban,
        // desbordándolas a una semana de calendario EXTRA (plan de 12 → 13). Un plan
        // de N semanas debe ocupar N semanas: una semana 1 más ligera es el precio
        // honesto de empezar tarde. En arranques en lunes deficit == baseSessions y
        // este Math.min no cambia nada.
        const sessionsInLastWeek = Math.min(deficit, baseSessions.length);

        console.log('[ensureWorkoutScheduleV3] Calculando compensación para última semana:', {
          planId: methodologyPlanId,
          totalExpectedSessions: __fixedTotalExpectedSessions,
          sessionsProgrammedSoFar,
          deficit,
          sessionsInLastWeek,
          levelFixedDays
        });

        if (sessionsInLastWeek > baseSessions.length) {
          // Necesitamos más sesiones de las que hay en el plan base
          const extendedSessions = [...baseSessions];
          const additionalNeeded = sessionsInLastWeek - baseSessions.length;

          console.log('[ensureWorkoutScheduleV3] Extendiendo última semana:', {
            planId: methodologyPlanId,
            baseSessions: baseSessions.length,
            additionalNeeded
          });

          // Añadir sesiones adicionales usando días fijos en orden cíclico
          for (let i = 0; i < additionalNeeded; i++) {
            const sourceSession = baseSessions[i % baseSessions.length];
            const targetDay = levelFixedDays[extendedSessions.length % levelFixedDays.length];
            extendedSessions.push({
              ...sourceSession,
              dia: targetDay,
              __compensatory: true
            });
          }

          sessionsToSchedule = extendedSessions.map(session => ({ ...session }));

          console.log('[ensureWorkoutScheduleV3] Última semana extendida:', {
            planId: methodologyPlanId,
            totalSessions: sessionsToSchedule.length,
            días: sessionsToSchedule.map(s => s.dia)
          });
        }
      }

      const sessionsByDay = new Map();
      for (const session of sessionsToSchedule) {
        const key = normalizeDayAbbrev(session.dia);
        if (!key) continue;
        if (!sessionsByDay.has(key)) {
          sessionsByDay.set(key, []);
        }
        sessionsByDay.get(key).push(session);
      }

      if (weekIndex === 0) {
        console.log('[ensureWorkoutScheduleV3] sessionsByDay construido:', {
          planId: methodologyPlanId,
          keys: Array.from(sessionsByDay.keys()),
          sessionsPerKey: Array.from(sessionsByDay.entries()).map(([k, v]) => ({
            dia: k,
            count: v.length
          }))
        });
      }

      let weekSessionOrder = 1;

      // 🗓️ CALENDARIO: Las semanas siempre son Lunes→Domingo
      // Calcular el lunes de la semana en que empieza el plan
      const mondayOfStartWeek = new Date(planStartDate);
      // startDayOfWeek ya fue declarado arriba (línea 141)

      // 🎯 FIX: Para planes D1-D5 que empiezan en lunes, ESE lunes es el inicio
      const isD1D5Plan = planData.metodologia === HIPERTROFIA_PERSISTED_TYPE ||
                         (firstWeekPattern && firstWeekPattern.includes('Lun-Mar-Mie-Jue-Vie'));

      let daysToMonday;
      if (isD1D5Plan && startDayOfWeek === 1) {
        // Plan D1-D5 que empieza lunes → NO retroceder
        daysToMonday = 0;
      } else {
        // Lógica normal para otros planes
        daysToMonday = startDayOfWeek === 0 ? -6 : 1 - startDayOfWeek; // Si es domingo, retroceder 6 días
      }

      mondayOfStartWeek.setDate(planStartDate.getDate() + daysToMonday);
      mondayOfStartWeek.setHours(0, 0, 0, 0);

      // 🐛 FIX CRÍTICO: Normalizar planStartDate para comparaciones
      // Sin esto, planStartDate tiene hora (ej: 21:19:07) y currentDate es 00:00:00
      // Causaba que el día de inicio se marcara como descanso y se saltara
      const planStartDateNormalized = new Date(planStartDate);
      planStartDateNormalized.setHours(0, 0, 0, 0);

      if (weekIndex === 0) {
        console.log('[ensureWorkoutScheduleV3] Calendario semana 1:', {
          planId: methodologyPlanId,
          planStartDate: formatLocalDate(planStartDate),
          planStartDateNormalized: formatLocalDate(planStartDateNormalized),
          startDayOfWeek: DAY_NAMES[startDayOfWeek],
          mondayOfWeek: formatLocalDate(mondayOfStartWeek),
          sessionDays: Array.from(sessionsByDay.keys())
        });
      }

      // 🎯 FIX (semanas a la deriva): el bucle NO se extiende más allá de la semana
      // de calendario (Lun→Dom). Antes, la última semana seguía iterando mientras
      // quedaran sesiones sin asignar, creando días con effectiveWeekNumber = N+1
      // (semana fantasma). Junto con el cap del déficit, el plan ocupa exactamente
      // sus N semanas.
      for (let dayInWeek = 0; dayInWeek < 7; dayInWeek++) {
        // Calcular fecha actual: lunes de la primera semana + offset de semana + día de la semana
        const currentDate = new Date(mondayOfStartWeek);
        currentDate.setDate(mondayOfStartWeek.getDate() + (weekIndex * 7) + dayInWeek);
        currentDate.setHours(0, 0, 0, 0);

        const dow = currentDate.getDay();
        const dayName = DAY_NAMES[dow];
        const dayAbbrev = DAY_ABBREVS[dow];
        const effectiveWeekNumber = weekNumber + Math.floor(dayInWeek / 7);

        // ⏳ PRIMERA SEMANA: Solo programar sesiones desde el día de inicio en adelante
        if (isFirstWeek && currentDate < planStartDateNormalized) {
          await client.query(
            'INSERT INTO app.methodology_plan_days (plan_id, day_id, week_number, day_name, date_local, is_rest) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (plan_id, day_id) DO NOTHING',
            [methodologyPlanId, dayId, effectiveWeekNumber, dayAbbrev, formatLocalDate(currentDate), true]
          );
          dayId++;
          continue;
        }

        const queue = sessionsByDay.get(dayAbbrev);
        const sesion = queue && queue.length > 0 ? queue.shift() : null;

        if (weekIndex === 0 && dayInWeek >= 2) { // Solo loggear desde miércoles en adelante en semana 1
          console.log(`[ensureWorkoutScheduleV3] Día ${dayInWeek} (${dayAbbrev}):`, {
            planId: methodologyPlanId,
            currentDate: formatLocalDate(currentDate),
            dayAbbrev,
            queueExists: !!queue,
            queueLength: queue?.length || 0,
            sesionFound: !!sesion,
            sessionsByDayKeys: Array.from(sessionsByDay.keys())
          });
        }

        if (queue && queue.length === 0) {
          sessionsByDay.delete(dayAbbrev);
        }

        if (!sesion) {
          await client.query(
            'INSERT INTO app.methodology_plan_days (plan_id, day_id, week_number, day_name, date_local, is_rest) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (plan_id, day_id) DO NOTHING',
            [methodologyPlanId, dayId, weekNumber, dayAbbrev, formatLocalDate(currentDate), true]
          );
          dayId++;
          continue;
        }

        const sessionTitle = sesion?.titulo || sesion?.title || `Sesion ${globalSessionOrder}`;
        let sessionExercises = [];

        if (Array.isArray(sesion.ejercicios)) {
          sessionExercises = sesion.ejercicios;
        } else if (Array.isArray(sesion.bloques)) {
          const mainBlock = sesion.bloques.find(b => {
            const name = stripDiacritics(String(b?.nombre || b?.name || b?.titulo || '').toLowerCase());
            const tipo = stripDiacritics(String(b?.tipo || '').toLowerCase());
            return tipo === 'principal' || tipo === 'main' || name.includes('principal') || name.includes('trabajo');
          });
          const sourceBlocks = mainBlock ? [mainBlock] : sesion.bloques;
          sessionExercises = sourceBlocks.flatMap(b => Array.isArray(b?.ejercicios) ? b.ejercicios : []);
        }

        if (limitPerSession && Array.isArray(sessionExercises) && sessionExercises.length > limitPerSession) {
          console.log('[ensureWorkoutScheduleV3] Recortando ejercicios', {
            planId: methodologyPlanId,
            weekNumber,
            dayAbbrev,
            before: sessionExercises.length,
            limit: limitPerSession
          });
          sessionExercises = sessionExercises.slice(0, limitPerSession);
        }

        // Guard anti-duplicados: en QA se observaron filas repetidas para la misma
        // fecha del mismo plan (p.ej. dos "Sesion 6" el mismo viernes). Nunca debe
        // haber dos sesiones programadas del mismo plan en la misma fecha.
        // PR3 (spec §9.2): el mismo dayId identifica esta fila en workout_schedule y en
        // methodology_plan_days, para que Nutrición llegue al metadato del día por day_id
        // (join §12.1) sin buscar por títulos ni posiciones de arrays.
        const planDayMetadata = buildPlanDayMetadata(sesion); // null salvo que el motor emita carga

        const wsInsert = await client.query(
          // ON CONFLICT DO NOTHING sobre el índice único
          // uq_workout_schedule_plan_user_date: race-proof (dos generaciones
          // simultáneas ya no crean duplicados; antes el guard NOT EXISTS tenía
          // una condición de carrera TOCTOU). Ver DATA-002.
          // COR-F0-04 §2/§3: RETURNING day_id para conocer el ID canónico realmente
          // persistido en el calendario. Si el INSERT cae en conflicto (rowCount=0),
          // NO usamos el dayId local nuevo para methodology_plan_days: recuperamos el
          // day_id de la fila existente y lo reutilizamos, evitando IDs cruzados entre
          // workout_schedule y methodology_plan_days en regeneraciones/dobles ejecuciones.
          `INSERT INTO app.workout_schedule (methodology_plan_id, user_id, day_id, week_number, session_order, week_session_order, scheduled_date, day_name, day_abbrev, session_title, exercises, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (methodology_plan_id, user_id, scheduled_date) DO NOTHING
           RETURNING day_id`,
          [
            methodologyPlanId,
            userId,
          dayId,
          effectiveWeekNumber,
          globalSessionOrder,
          weekSessionOrder,
          formatLocalDate(currentDate),
          dayName,
          dayAbbrev,
          sessionTitle,
            JSON.stringify(sessionExercises),
            'scheduled'
          ]
        );

        // day_id canónico del calendario para ESTA fecha: el recién insertado, o el de
        // la fila ya existente si hubo conflicto. Nunca un day_id independiente nuevo.
        let canonicalDayId = wsInsert.rows?.[0]?.day_id ?? dayId;
        if (wsInsert.rowCount === 0) {
          const existingWs = await client.query(
            `SELECT day_id FROM app.workout_schedule
              WHERE methodology_plan_id = $1 AND user_id = $2 AND scheduled_date = $3`,
            [methodologyPlanId, userId, formatLocalDate(currentDate)]
          );
          if (existingWs.rows?.[0]?.day_id != null) {
            canonicalDayId = existingWs.rows[0].day_id;
          }
        }

        await client.query(
          'INSERT INTO app.methodology_plan_days (plan_id, day_id, week_number, day_name, date_local, is_rest, planned_exercises_count, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (plan_id, day_id) DO NOTHING',
          [methodologyPlanId, canonicalDayId, effectiveWeekNumber, dayAbbrev, formatLocalDate(currentDate), false, Array.isArray(sessionExercises) ? sessionExercises.length : 0, planDayMetadata ? JSON.stringify(planDayMetadata) : null]
        );

        dayId++;
        globalSessionOrder++;
        weekSessionOrder++;
      }

      if (sessionsByDay.size > 0) {
        console.warn('[ensureWorkoutScheduleV3] Sesiones sin asignar despues de iterar dias', {
          planId: methodologyPlanId,
          weekNumber,
          remainingKeys: Array.from(sessionsByDay.keys())
        });
      }
    }

    const totalSessions = globalSessionOrder - 1;
    const totalDays = dayId - 1;
    const restDays = totalDays - totalSessions;

    if (usingSavepoint) {
      // Materialización correcta: liberamos el savepoint (no revierte nada).
      try { await client.query('RELEASE SAVEPOINT ensure_schedule_v3'); } catch { /* noop */ }
    }

    console.log('[ensureWorkoutScheduleV3] Programacion generada', {
      planId: methodologyPlanId,
      totalDays,
      trainingDays: totalSessions,
      restDays,
      startDate: formatLocalDate(startDate) || String(startDate)
    });
  } catch (error) {
    console.error('Error en ensureWorkoutScheduleV3:', error?.message || error);
    if (usingSavepoint) {
      // Estábamos dentro de una transacción del caller: revertimos SOLO este bloque
      // (limpia el estado abortado) y PROPAGAMOS el error estructural en vez de ocultarlo.
      try { await client.query('ROLLBACK TO SAVEPOINT ensure_schedule_v3'); } catch { /* noop */ }
      throw error;
    }
    // Auto-commit: no hay transacción del caller que abortar; cada sentencia fue su
    // propia transacción implícita. Mantenemos el comportamiento no bloqueante para
    // no romper los flujos de nutrición que invocan esta función sin try/catch.
  }
}
